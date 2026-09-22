"""
Tests for the new features: GroqKeyPool, history compression, streaming
endpoint, citations, graph builder, share routes.

Kept separate from test_api.py so that the base API surface stays a stable
regression check.
"""
from fastapi.testclient import TestClient
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import env_loader  # noqa: F401 — loads .env + .env.local

from main import app  # noqa: E402

client = TestClient(app)


# ------- GroqKeyPool -----------------------------------------------------

def test_groq_pool_needs_at_least_one_key():
    from services.groq_pool import GroqKeyPool
    try:
        GroqKeyPool([])
    except ValueError:
        print("[PASS] GroqKeyPool rejects empty key list")
        return
    raise AssertionError("Expected ValueError for empty key list")


def test_groq_pool_build_from_env_prefers_multi():
    """GROQ_API_KEYS takes precedence over GROQ_API."""
    import importlib
    import services.groq_pool as gp

    orig_multi = os.environ.get("GROQ_API_KEYS", "")
    orig_single = os.environ.get("GROQ_API", "")
    try:
        os.environ["GROQ_API_KEYS"] = "gsk_fake1,gsk_fake2,gsk_fake3"
        os.environ["GROQ_API"] = "gsk_single"
        importlib.reload(gp)
        pool = gp.build_pool_from_env()
        assert pool is not None
        assert pool.size == 3
    finally:
        os.environ["GROQ_API_KEYS"] = orig_multi
        os.environ["GROQ_API"] = orig_single
        importlib.reload(gp)
    print("[PASS] build_pool_from_env prefers GROQ_API_KEYS multi over single")


def test_groq_pool_cooldown_marks_key_unavailable():
    """After marking a key exhausted, it should be skipped."""
    from services.groq_pool import GroqKeyPool
    pool = GroqKeyPool(["fake_a", "fake_b"])
    # Manually mark index 0 as in cooldown
    pool._cooldown_until[0] = time.time() + 60
    picked = [pool._pick_index() for _ in range(4)]
    # Should never return 0 while it's in cooldown
    assert 0 not in picked, f"Expected 0 to be skipped, got {picked}"
    print("[PASS] cooldown skips exhausted key")


# ------- History compression --------------------------------------------

def test_compress_history_short_passthrough():
    """If history is short, no compression should happen."""
    from services.llm_service import compress_history
    hist = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    out = compress_history(hist)
    assert out == hist
    print("[PASS] compress_history passes short history through unchanged")


def test_compress_history_threshold_trigger():
    """History longer than threshold should be compressed OR gracefully
    fall back to sliding window (if summarize fails)."""
    from services.llm_service import compress_history, KEEP_RECENT_TURNS, COMPRESSION_THRESHOLD

    # Build a history that's longer than the threshold
    hist = []
    for i in range(COMPRESSION_THRESHOLD + 4):
        role = "user" if i % 2 == 0 else "assistant"
        hist.append({"role": role, "content": f"message {i}"})

    out = compress_history(hist)
    # Either compressed (summary + recent) or fallback (just recent)
    # In both cases length should be <= the recent window + 1
    assert len(out) <= KEEP_RECENT_TURNS + 1, f"len={len(out)}"
    # Recent verbatim messages must be preserved at the end
    assert out[-1]["content"].startswith("message ")
    print(f"[PASS] compress_history compressed {len(hist)} -> {len(out)} turns")


# ------- Streaming route ------------------------------------------------

def test_chat_stream_short_circuit_no_data():
    """With no uploaded data, /chat/stream should still respond via SSE."""
    with client.stream("POST", "/chat/stream", json={"message": "test"}) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = "".join(resp.iter_text())
    assert "event: metadata" in body
    assert "event: token" in body
    assert "event: done" in body
    print("[PASS] /chat/stream returns SSE frames even when no data uploaded")


# ------- Citation parser (frontend logic port in Python) ----------------

def test_citation_regex_matches_common_formats():
    """
    The frontend uses this pattern; verify it matches [file.ext],
    [file.ext:line], [file.ext:start-end], including paths like [src/main.py:12].
    """
    import re
    # Same pattern as frontend/src/lib/citations.ts
    CITATION_RE = re.compile(r'\[((?:[\w./-]+)\.\w{1,6})(?::(\d+)(?:-(\d+))?)?\]')

    cases = [
        ("See [main.py:12-24]", "main.py", "12", "24"),
        ("Check [routes/chat.py:5]", "routes/chat.py", "5", None),
        ("The file [README.md] explains", "README.md", None, None),
        ("Look at [src/utils/helper.ts:100-150]", "src/utils/helper.ts", "100", "150"),
    ]
    for text, exp_file, exp_start, exp_end in cases:
        m = CITATION_RE.search(text)
        assert m, f"No match in {text!r}"
        assert m.group(1) == exp_file
        assert m.group(2) == exp_start
        assert m.group(3) == exp_end
    print(f"[PASS] citation regex matches {len(cases)} common formats")


def test_citation_regex_rejects_ordinary_brackets():
    """Bracket text without a file extension shouldn't match."""
    import re
    CITATION_RE = re.compile(r'\[((?:[\w./-]+)\.\w{1,6})(?::(\d+)(?:-(\d+))?)?\]')
    misses = ["[TODO]", "[ok]", "[not-a-file]", "[link text](url)"]
    for text in misses:
        assert CITATION_RE.search(text) is None, f"Unexpected match in {text!r}"
    print("[PASS] citation regex ignores non-file brackets")


# ------- Line-number attachment in chunks -------------------------------

def test_chunks_carry_line_numbers():
    """Chunks should have line_start / line_end metadata after chunking."""
    from services import get_pinecone_manager
    from langchain_core.documents import Document
    pm = get_pinecone_manager()

    content = "\n".join(f"line {i}" for i in range(1, 200))  # 200 lines
    doc = Document(page_content=content, metadata={"source": "/tmp/x/big.txt"})
    chunks = pm.chunk_documents([doc])

    assert len(chunks) >= 1
    for chunk in chunks:
        assert "line_start" in chunk.metadata
        assert "line_end" in chunk.metadata
        assert chunk.metadata["line_start"] >= 1
        assert chunk.metadata["line_end"] >= chunk.metadata["line_start"]

    # First chunk should start at line 1
    assert chunks[0].metadata["line_start"] == 1
    print(f"[PASS] {len(chunks)} chunks carry line_start/line_end metadata")


# ------- Graph builder --------------------------------------------------

def test_graph_builder_on_self():
    """Build a dependency graph of the backend itself."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('gb', 'services/graph_builder.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    g = mod.build_dependency_graph('.', max_nodes=30)
    assert g["stats"]["files_scanned"] > 10
    assert g["stats"]["internal_edges"] > 0
    assert g["stats"]["kept_nodes"] > 0
    assert "graph LR" in g["mermaid"]

    # External deps should include recognizable Python packages
    ext_names = {d["name"] for d in g["stats"]["external_deps"]}
    # We know backend uses these
    for name in ("fastapi", "pydantic"):
        assert name in ext_names, f"Expected {name} in {ext_names}"
    print(f"[PASS] graph builder: {g['stats']['kept_nodes']} nodes, {g['stats']['kept_edges']} edges")


def test_graph_builder_handles_missing_dir():
    """A path that doesn't exist should return an empty graph, not crash."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('gb', 'services/graph_builder.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    g = mod.build_dependency_graph('/nonexistent/path/xyz')
    assert g["nodes"] == []
    assert g["edges"] == []
    print("[PASS] graph builder handles missing directory")


def test_architecture_route_no_data():
    """GET /architecture should 400 when no repo is loaded."""
    r = client.get("/architecture")
    assert r.status_code == 400
    print("[PASS] /architecture requires an uploaded repo")


# ------- Share routes ---------------------------------------------------

def test_share_routes_behavior_without_supabase():
    """
    When SUPABASE isn't configured, share endpoints return 503, not 500.
    When it IS configured, /share/create still 400s if no session data.
    """
    from services.share_service import is_configured

    r = client.post("/share/create", json={"messages": []})
    if is_configured():
        # No session data uploaded
        assert r.status_code == 400
        assert "session" in r.json()["detail"].lower() or "code" in r.json()["detail"].lower()
        print("[PASS] /share/create returns 400 without session data")
    else:
        assert r.status_code == 503
        print("[PASS] /share/create returns 503 when Supabase unconfigured")


def test_share_get_nonexistent():
    """GET /share/<random-id> returns 404 or 503 depending on config."""
    from services.share_service import is_configured
    r = client.get("/share/00000000-0000-0000-0000-000000000000")
    if is_configured():
        assert r.status_code == 404
        print("[PASS] /share/<unknown> returns 404")
    else:
        assert r.status_code == 503
        print("[PASS] /share/<unknown> returns 503 without Supabase")


# ------- File-content endpoint ------------------------------------------

def test_file_content_no_session():
    """GET /file-content should 400 when no session is active."""
    r = client.get("/file-content?path=main.py")
    assert r.status_code == 400
    print("[PASS] /file-content returns 400 without session")


# ------- Runner ---------------------------------------------------------

TESTS = [
    test_groq_pool_needs_at_least_one_key,
    test_groq_pool_build_from_env_prefers_multi,
    test_groq_pool_cooldown_marks_key_unavailable,
    test_compress_history_short_passthrough,
    test_compress_history_threshold_trigger,
    test_chat_stream_short_circuit_no_data,
    test_citation_regex_matches_common_formats,
    test_citation_regex_rejects_ordinary_brackets,
    test_chunks_carry_line_numbers,
    test_graph_builder_on_self,
    test_graph_builder_handles_missing_dir,
    test_architecture_route_no_data,
    test_share_routes_behavior_without_supabase,
    test_share_get_nonexistent,
    test_file_content_no_session,
]


if __name__ == "__main__":
    print(f"\nRunning {len(TESTS)} feature tests...\n")
    passed = 0
    failed = []
    for t in TESTS:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f"[FAIL] {t.__name__}: {e}")
            failed.append(t.__name__)
        except Exception as e:
            print(f"[ERROR] {t.__name__}: {type(e).__name__}: {e}")
            failed.append(t.__name__)

    print(f"\n{passed}/{len(TESTS)} passed")
    if failed:
        print(f"Failed: {failed}")
        sys.exit(1)
    print("\nAll feature tests passed.")
