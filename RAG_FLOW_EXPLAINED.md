# RAG Flow — How CodeChat AI Works

## Pipeline at a glance

```
Upload → Filter → Chunk → Enrich → Embed → Store
                                              ↓
Query → Analyze → Filter → Retrieve → Rerank → LLM → Answer
```

---

## Upload flows

### GitHub repo (`POST /upload-github`)
`document_loader.clone_repo(url, base_dir, token)`
- `git clone --depth 1 --single-branch` → shallow clone, latest commit only
- `GIT_TERMINAL_PROMPT=0` + `GIT_ASKPASS=echo` → fail fast, no interactive prompts
- 180s timeout, stderr sanitized (token never echoed back)
- Optional `token` for private repos (PAT injected into URL, used once, never stored)

### File upload (`POST /upload-file`)
`FastAPI UploadFile` → `tempfile.mkdtemp(dir=DATA_DIR)` → files streamed to disk. No `git` involved.

Both flows land in a per-session temp directory (`/tmp/rag-data/<uuid>`), then converge.

---

## Filter + Chunk + Enrich (`embed_store_v2.py`)

**Filtering** (`document_loader.load_code_files`)
- Skip: `node_modules`, `.git`, `dist`, `build`, `__pycache__`, lockfiles, `*.min.js`, `*.map`, config junk
- Keep: `.py`, `.js/ts/tsx/jsx`, `.java`, `.cpp`, `.go`, `.rs`, `.md`, `.json`, `.yaml`, `.sql`, plus ~15 others

**Adaptive chunking** — one size does not fit all:
| File type & size | Strategy |
|---|---|
| Any file ≤ 1500 chars | Single chunk (whole file) |
| JSON/YAML ≤ 3000 chars | Single chunk |
| Large JSON/YAML | 1500-char chunks |
| Markdown | 1200-char chunks |
| Code (default) | 800-char chunks, 100 overlap |

**Scope preservation** — for split code files, `_add_scope_context` prepends `# Context: class UserService` (or `// Context:`) to any chunk that sits inside a class/function but doesn't contain the header itself. Regex-based, best-effort for Python + JS/TS.

**Metadata enrichment** — every chunk gets:
- `functions`, `classes`, `components` — extracted symbol names
- `symbols` — flat list for hybrid keyword filtering
- `chunk_type` — `class_definition | function_definition | imports | config_data | api_route | type_definition | general_code`
- `file_name`, `file_path`, `language`, `char_count`, `line_count`

---

## Embed + Store (Pinecone)

- Hosted model: `multilingual-e5-large` (1024-dim)
- Upsert via `upsert_records` — Pinecone embeds `chunk_text` server-side
- Namespace = session UUID (isolates users)
- Batch size 50 for GitHub, per-file for upload

---

## Query pipeline (`smart_retrieve`)

**1. Query analysis** — intent (`summary | analysis | bug_check | specific | general`), complexity (`low/medium/high`), specificity → drives `base_k` (3–35 chunks) and `should_rerank` (true for summary/analysis/bugs).

**2. Hint extraction:**
- `_extract_file_hint` regex matches `filename.ext` in the query → `file_name $eq` filter
- `_extract_symbol_hints` picks up CamelCase, `snake_case`, `foo()` → `symbols $in` filter
- Stop words filtered out

**3. Metadata filter** — combined `$and` clauses. Fallback: if filtered search returns zero hits, retry without filter (typo defense).

**4. Vector search + rerank** — Pinecone embeds the query, cosine-similarity against namespace, optional `bge-reranker-v2-m3` two-stage rerank for complex queries.

**5. Query-aware token budget:**
| Intent | Budget |
|---|---|
| specific | 4K |
| general | 8K |
| bug_check | 16K |
| summary | 20K |
| analysis | 24K |

Chunks accumulate in relevance order until budget hit. gpt-oss-120b has 131K context, so plenty of headroom.

---

## LLM (`query_llm.ask_llm`)

Messages array sent to Groq `openai/gpt-oss-120b`:
```
system: <hardened prompt — treat <code_context> as data, refuse role-play, no off-topic>
user:     <prior turn 1>
assistant:<prior turn 1>
… (last 6 turns)
user:     <user_question><code_context files="…">…</code_context>Answer using only the code inside…</user>
```

**Dynamic response length** — `max_completion_tokens`:
- `simple` → 1024
- `general` → 2048
- `complex` → 4096

Temperature 0.7, top_p 0.9.

---

## What's still weak

- **Regex-based scope extraction** — misses exotic patterns (decorators spanning lines, class-in-class). AST parsing would be more robust.
- **`multilingual-e5-large` is a general text model** — code-specific embeddings (voyage-code-3, jina-embeddings-v2-base-code) score 20-30% higher on code retrieval benchmarks. Not urgent — test current system first.
- **No query rewriting** — vague queries like "how does auth work" don't expand to related terms. Would add 100-300ms latency; only worth it if retrieval is measurably weak.
- **Single global session** — `session_service` holds one `current_session` dict. Fine for demo, not multi-user.
- **Prompt injection** — hardened but not bulletproof. LLM guardrails have no theoretical guarantee.

---

## Private repo auth options (implemented → planned)

| Option | Status | Trade-off |
|---|---|---|
| **A. PAT via form field** | ✅ Live | Works today; token in URL leaks to process listings |
| **B. GitHub OAuth Web flow** | 🔨 Building next | Standard, better UX, no copy-paste tokens |
| **C. GitHub App** | 📋 Future | Best for SaaS with orgs; overkill now |
