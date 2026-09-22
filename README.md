# CodeChat AI

AI-powered code analysis with RAG. Upload a codebase or connect a GitHub repo, then chat with it — get summaries, find bugs, understand architecture, all grounded in your actual code.

[![Verified on Redential](https://www.redential.com/api/badge/beinghadibadami.svg)](https://www.redential.com/u/beinghadibadami)

**Live:** [codechat-jgxg.onrender.com](https://codechat-jgxg.onrender.com)

---

## Features

- **RAG-based Q&A** — semantic retrieval + reranking, grounded in your code
- **Streaming responses** — first token in ~1.8s, feels 10× faster than blocking
- **Inline citations** — LLM cites `[main.py:12-34]`; click to open the file at that line
- **Architecture diagrams** — auto-generated Mermaid dependency graphs
- **Multi-turn chat** — history sent back to the LLM, older turns auto-summarized
- **GitHub OAuth** — one-click private repo access, no PAT copy-paste
- **Shareable sessions** — copy a `/s/<id>` link, send read-only Q&A to teammates
- **Multi-key Groq pool** — rotate across accounts, auto-cooldown on rate limits
- **Prompt-injection hardened** — retrieved code is fenced, LLM refuses role-play

See [`RAG_FLOW_EXPLAINED.md`](./RAG_FLOW_EXPLAINED.md) for how the pipeline actually works.

---

## Tech Stack

**Frontend:** React 18 + TypeScript, Vite, Tailwind + shadcn/ui, React Query, Mermaid, react-markdown

**Backend:** FastAPI, Groq (`openai/gpt-oss-120b` primary + `openai/gpt-oss-20b` for summaries), Pinecone (hosted `multilingual-e5-large` embeddings + `bge-reranker-v2-m3`), LangChain text splitter, Supabase (Postgres, optional — for share links)

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Free API keys: [Groq](https://console.groq.com), [Pinecone](https://www.pinecone.io)
- Optional: [Supabase](https://supabase.com) project for share links, [GitHub OAuth App](https://github.com/settings/developers) for private repos

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env    # then fill in keys
python main.py
# → http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Required | Notes |
|---|---|---|
| `GROQ_API_KEYS` | **Yes** (or `GROQ_API`) | Comma-separated pool for rotation |
| `GROQ_API` | Fallback | Single-key mode if `GROQ_API_KEYS` empty |
| `PINECONE_API_KEY` | **Yes** | Vector DB |
| `DATA_DIR` | No | Where cloned repos live (default `/tmp/rag-data`) |
| `GITHUB_CLIENT_ID` | No | OAuth App for private repos |
| `GITHUB_CLIENT_SECRET` | No | OAuth App secret |
| `GITHUB_REDIRECT_URI` | No | `<BACKEND_URL>/auth/github/callback` |
| `FRONTEND_URL` | No | Where callback redirects back to |
| `SUPABASE_URL` | No | Enables the "Share" feature |
| `SUPABASE_KEY` | No | Use the **service_role** key, not anon |

---

## Optional Setup — Private Repos (GitHub OAuth)

1. Go to https://github.com/settings/developers → **New OAuth App**
2. Set **Authorization callback URL** to `<BACKEND_URL>/auth/github/callback`
3. Copy Client ID + generate a Client Secret
4. Add all four `GITHUB_*` env vars + `FRONTEND_URL` to `backend/.env`
5. Restart the backend — the "Connect GitHub" button appears in the UI

If OAuth isn't configured, a manual Personal Access Token input is offered as fallback (still works, just less nice UX).

---

## Optional Setup — Shareable Sessions (Supabase)

Create a Supabase project, then run this in the SQL editor:

```sql
create extension if not exists "pgcrypto";

create table if not exists shared_sessions (
    id uuid primary key default gen_random_uuid(),
    namespace text not null,
    repo_url text,
    repo_name text,
    file_tree jsonb,
    created_at timestamptz not null default now(),
    expires_at timestamptz,
    view_count int not null default 0,
    is_public boolean not null default true
);

create table if not exists shared_messages (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references shared_sessions(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    metadata jsonb,
    position int not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_shared_sessions_created on shared_sessions(created_at desc);
create index if not exists idx_shared_messages_session on shared_messages(session_id, position);

alter table shared_sessions disable row level security;
alter table shared_messages disable row level security;
```

Add `SUPABASE_URL` + `SUPABASE_KEY` (service_role) to `backend/.env` and restart. The Share button in the chat header goes live automatically.

---

## Project Structure

```
codechat-ai/
├── backend/
│   ├── main.py                 # FastAPI app entry, router registration
│   ├── config.py               # Settings loaded from .env
│   ├── query_llm.py            # LLM calls (blocking + streaming + summarize)
│   ├── document_loader.py      # File filtering, git clone with token support
│   ├── embed_store_v2.py       # Chunking, metadata enrichment, retrieval
│   ├── models/schemas.py       # Pydantic request/response models
│   ├── services/
│   │   ├── session_service.py     # Session + GitHub token storage
│   │   ├── llm_service.py         # Context builder, history compression
│   │   ├── file_service.py        # File tree, safe file read
│   │   ├── pinecone_service.py    # Singleton Pinecone manager
│   │   ├── groq_pool.py           # Multi-key rotation with cooldown
│   │   ├── github_auth.py         # OAuth code exchange, user fetch
│   │   ├── graph_builder.py       # Import parser → Mermaid diagram
│   │   └── share_service.py       # Supabase persistence for share links
│   ├── routes/
│   │   ├── session.py             # /session-info, /reset-session
│   │   ├── upload.py              # /upload-file, /upload-github
│   │   ├── chat.py                # /chat, /chat/stream (SSE)
│   │   ├── files.py               # /file-tree, /file-content, /explain-file
│   │   ├── auth.py                # /auth/github/{login,callback,status,logout}
│   │   ├── architecture.py        # /architecture (dependency graph)
│   │   └── share.py               # /share/{create,{id},{id}/chat}
│   ├── tests/                     # test_api.py, test_features.py, test_e2e.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx                # Router + providers (ErrorBoundary, Theme)
    │   ├── pages/
    │   │   ├── Index.tsx          # Landing + upload
    │   │   └── SharedSession.tsx  # /s/:id read-only viewer
    │   ├── components/
    │   │   ├── ChatInterface.tsx  # Main chat UI (header actions, streaming)
    │   │   ├── GitHubCard.tsx     # Repo URL + OAuth/PAT input
    │   │   ├── FileViewer.tsx     # Citation modal with line highlight
    │   │   ├── ArchitectureView.tsx # Mermaid modal
    │   │   ├── MessageFormatter.tsx # Markdown + citation parsing
    │   │   ├── ErrorBoundary.tsx  # Global crash guard
    │   │   ├── ThemeToggle.tsx    # Dark / light
    │   │   └── LoadingSkeleton.tsx
    │   ├── hooks/
    │   │   ├── useChatHistory.ts  # localStorage persistence
    │   │   ├── useApiWithRetry.ts # Exponential backoff
    │   │   └── useGithubAuth.ts   # OAuth status polling
    │   ├── lib/
    │   │   ├── citations.ts       # [file:line] regex + React-tree walker
    │   │   └── exportChat.ts      # Markdown / JSON export
    │   └── services/api.ts        # Typed backend client
    └── package.json
```

---

## API Endpoints

**Health & session**
- `GET /` — health check
- `GET /session-info` — current namespace, has_data, file count
- `POST /reset-session` — clear uploaded code (keeps OAuth token)

**Upload**
- `POST /upload-file` — multipart file upload
- `POST /upload-github` — form field `repo_url`, optional `token`

**Chat**
- `POST /chat` — blocking JSON response, accepts `message` + `history[]`
- `POST /chat/stream` — Server-Sent Events (`metadata` → `token`s → `done`)

**Files**
- `GET /file-tree` — hierarchical tree of the uploaded repo
- `GET /file-content?path=...` — raw file contents for the citation viewer
- `POST /explain-file` — LLM-generated explanation of one file

**GitHub OAuth**
- `GET /auth/github/login` — redirect to GitHub authorize page
- `GET /auth/github/callback` — GitHub calls us here with `code` + `state`
- `GET /auth/github/status` — `{configured, connected, user}`
- `POST /auth/github/logout` — revoke token + clear session

**Architecture**
- `GET /architecture?max_nodes=50` — Mermaid diagram + node/edge stats

**Sharing**
- `POST /share/create` — snapshot current session, returns share id
- `GET /share/{id}` — read-only snapshot + messages
- `POST /share/{id}/chat` — follow-up question against the shared namespace

---

## Testing

Three suites in `backend/tests/`:

```bash
cd backend

# Unit + validation tests (no external calls)
python tests/test_api.py            # 23 tests

# Feature-specific tests (some hit Groq, mostly local)
python tests/test_features.py       # 15 tests

# Full end-to-end: clones a real repo, embeds, queries, streams
python tests/test_e2e.py            # Skips if API keys missing
```

E2E benchmarks on `pypa/sampleproject`:
- Clone + embed 9 files: **~12s**
- Blocking chat: **~3.7s**
- Streaming first token: **~1.8s**
- 18-turn history compression: works, falls back cleanly if summarize fails

---

## Deployment

### Backend (Render)
- Build: `pip install -r backend/requirements.txt`
- Start: `cd backend && python main.py`
- Add env vars from `.env.example`
- Enable persistent disk if you want repos to survive restarts (not required)

### Frontend (Vercel / Netlify / Render)
- Build: `cd frontend && npm install && npm run build`
- Publish dir: `frontend/dist`
- Env: `VITE_API_URL=<backend URL>` (if you're using it)

### CORS
Update `settings.CORS_ORIGINS` in `backend/config.py` to include your production frontend origin. Currently allows localhost + `codechat-jgxg.onrender.com`.

---

## Troubleshooting

**"No valid code files found"** → check supported extensions in `document_loader.py::SUPPORTED_EXTENSIONS`. If your file type isn't there, add it (and remember trailing commas — Python silently concatenates adjacent string literals).

**Chat returns "no relevant information"** → the file might not have been indexed. Check `/file-tree` vs `files_processed` in `/session-info`. Skipped dirs (`node_modules`, `dist`, etc.) live in `document_loader.py::SKIP_DIRS`.

**"Authentication failed" on GitHub upload** → for private repos, either connect OAuth (button on the GitHub card) or paste a PAT with `repo` scope.

**Share button disabled or 503** → Supabase isn't configured. Follow the schema setup above.

**Streaming shows nothing, then everything at once** → your reverse proxy is buffering SSE. On Nginx add `proxy_buffering off` for the `/chat/stream` route. Render doesn't need any tweak.

**Rate-limited by Groq** → add more keys to `GROQ_API_KEYS` (comma-separated). The pool auto-rotates and cools down 429'd keys for 60s.

---

## Roadmap

- Diff/PR-aware chat — auto-fetch PRs via OAuth token when the user references one
- Query rewriting with a fast model — expand vague queries before embedding
- Code-aware embeddings — swap `multilingual-e5-large` for `voyage-code-3` or `jina-embeddings-v2-base-code`
- Per-user sessions — replace the single-process in-memory store with Redis-backed sessions

---

## License

MIT
