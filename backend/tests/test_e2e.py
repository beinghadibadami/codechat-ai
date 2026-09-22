"""
End-to-end smoke test — actually hits Groq and Pinecone.

Uses a tiny public repo to keep it fast. Run with:
    python tests/test_e2e.py

Skips gracefully if GROQ_API/GROQ_API_KEYS or PINECONE_API_KEY isn't set.
"""
import os
import sys
import time
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import env_loader  # noqa: F401 — loads .env + .env.local

# Skip if we don't have keys
_groq = os.getenv("GROQ_API") or os.getenv("GROQ_API_KEYS")
if not _groq or not os.getenv("PINECONE_API_KEY"):
    print("[SKIP] E2E — missing Groq or Pinecone keys")
    sys.exit(0)

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)

TINY_REPO = "https://github.com/pypa/sampleproject"


def step(msg):
    print(f"\n=== {msg} ===")


def test_full_pipeline():
    step("1. Reset session")
    r = client.post("/reset-session")
    assert r.status_code == 200
    print(f"   ns={r.json()['namespace'][:8]}...")

    step("2. Upload GitHub repo")
    t0 = time.time()
    r = client.post("/upload-github", data={"repo_url": TINY_REPO})
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    print(f"   Cloned + embedded in {elapsed:.1f}s")

    step("3. Blocking chat query")
    t0 = time.time()
    r = client.post("/chat", json={"message": "What does this repository contain?"})
    elapsed = time.time() - t0
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    # New: sources array should be present
    assert "sources" in data["metadata"], "metadata.sources missing"
    assert len(data["metadata"]["sources"]) > 0
    first_source = data["metadata"]["sources"][0]
    assert "file_name" in first_source
    assert "line_start" in first_source
    print(f"   Blocking answer in {elapsed:.1f}s, {len(data['metadata']['sources'])} sources")

    step("4. Streaming chat query")
    t0 = time.time()
    saw_events = {"metadata": False, "token": False, "done": False}
    token_count = 0
    first_token_time = None

    with client.stream("POST", "/chat/stream", json={
        "message": "Summarize the sampleproject repo in one paragraph."
    }) as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if not line:
                continue
            if line.startswith("event: "):
                event = line[7:]
                if event in saw_events:
                    saw_events[event] = True
            elif line.startswith("data: "):
                data_json = line[6:]
                try:
                    parsed = json.loads(data_json)
                    if parsed.get("text"):
                        token_count += 1
                        if first_token_time is None:
                            first_token_time = time.time() - t0
                except Exception:
                    pass

    total_time = time.time() - t0
    assert saw_events["metadata"], "No metadata event seen"
    assert saw_events["token"], "No token events seen"
    assert saw_events["done"], "No done event seen"
    assert token_count > 5, f"Only {token_count} tokens streamed"
    print(f"   First token at {first_token_time:.2f}s, total {total_time:.1f}s, {token_count} chunks")

    step("5. Multi-turn chat with history")
    r = client.post("/chat", json={
        "message": "What language is it written in?",
        "history": [
            {"role": "user", "content": "What does this repository contain?"},
            {"role": "assistant", "content": "It's a Python sample project for PyPA."},
        ],
    })
    assert r.status_code == 200
    print(f"   Follow-up (with history) succeeded: {r.json()['response'][:100]}...")

    step("6. History compression trigger (long conversation)")
    # Build history longer than the compression threshold (10) but under
    # the API's max_length (20). We use 18 = 9 pairs.
    long_history = []
    for i in range(9):
        long_history.append({"role": "user", "content": f"Question {i} about the codebase"})
        long_history.append({"role": "assistant", "content": f"Answer {i} about files"})
    assert len(long_history) == 18

    r = client.post("/chat", json={
        "message": "Given all we've discussed, what's the main entry point?",
        "history": long_history,
    })
    if r.status_code != 200:
        print(f"   [ERROR] status={r.status_code} body={r.text[:300]}")
    assert r.status_code == 200
    print(f"   Compressed history query succeeded: {r.json()['response'][:100]}...")

    step("7. Architecture diagram")
    r = client.get("/architecture?max_nodes=30")
    assert r.status_code == 200
    arch = r.json()
    assert "graph LR" in arch["mermaid"]
    print(f"   Graph: {arch['stats']['kept_nodes']} nodes, {arch['stats']['kept_edges']} edges")
    if arch["stats"]["external_deps"]:
        top = arch["stats"]["external_deps"][:5]
        print(f"   Top externals: {[d['name'] for d in top]}")

    step("8. File content endpoint")
    if arch["nodes"]:
        # Pick a Python file
        py_node = next((n for n in arch["nodes"] if n["language"] == "python"), arch["nodes"][0])
        r = client.get(f"/file-content?path={py_node['path']}")
        assert r.status_code == 200
        content = r.json()
        assert "content" in content
        assert content["total_lines"] > 0
        print(f"   /file-content: {py_node['path']} = {content['total_lines']} lines")

    step("9. Citation resolution")
    # Ask a question that should produce citations
    r = client.post("/chat", json={
        "message": "Explain the main setup entry point of this project. Cite specific files."
    })
    resp_text = r.json()["response"]
    import re
    citations = re.findall(r'\[([\w./-]+\.\w{1,6})(?::(\d+)(?:-(\d+))?)?\]', resp_text)
    if citations:
        print(f"   Model cited {len(citations)} files: {[c[0] for c in citations[:5]]}")
    else:
        print(f"   No citations in response (model may not have used the format)")

    print("\n=== E2E COMPLETE ===")


if __name__ == "__main__":
    try:
        test_full_pipeline()
    except AssertionError as e:
        print(f"\n[FAIL] {e}")
        sys.exit(1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
