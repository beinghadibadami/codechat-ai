# CodeChat AI

AI-powered code analysis with RAG. Upload a codebase or connect a GitHub repo, then chat with it — get summaries, find bugs, understand architecture, all grounded in your actual code.

[![Verified on Redential](https://www.redential.com/api/badge/beinghadibadami.svg)](https://www.redential.com/u/beinghadibadami)

**Live:** [codechat-jgxg.onrender.com](https://codechat-jgxg.onrender.com)

---

## Features

- **RAG-based Q&A** — semantic retrieval + reranking, grounded in your code
- **Streaming responses** — first token in ~1.8s, with blocking fallback if SSE is buffered
- **Inline citations** — the model cites `[main.py:12-34]`; click to open that line in the source pane
- **Architecture diagrams** — Mermaid dependency graph parsed from real imports; click a node to read the file
- **PR-aware chat** — reference `#412` in any question and the diff is fetched and attached automatically
- **Multi-turn chat** — recent turns are sent verbatim, older ones auto-summarised
- **GitHub OAuth** — private repos without copy-pasting a token (PAT still supported as a fallback)
- **Shareable sessions** — `/s/<id>` read-only links with working citations and follow-up questions
- **Multi-key Groq pool** — rotates across accounts, cools down rate-limited keys
- **Prompt-injection hardened** — retrieved code is fenced as data; the model refuses role-play and off-topic drift
- **Dark and light themes** — warm editorial light mode, cool near-black dark mode, persisted

See [`RAG_FLOW_EXPLAINED.md`](./RAG_FLOW_EXPLAINED.md) for how the pipeline actually works.

---

## Interface

The app is a multi-route workspace behind a shared shell (sidebar + top bar):

| Route | Purpose |
|---|---|
| `/` | Workspace — connect a source, or jump off into a ready codebase |
| `/chat` | Three-pane chat: file tree · conversation · source preview |
| `/files` | Browse and read any indexed file |
| `/architecture` | Dependency graph, click-through to source |
| `/pulls` | Pull request list, diff viewer, and diff-focused chat |
| `/shared` | Manage read-only share links |
| `/settings` | Connections, theme, active session |
| `/s/:id` | Public read-only conversation (no shell) |

**Design system.** Editor-inspired: 1px hairlines, small radii, two functional
accents only — amber for primary actions, selections and citations; cyan for
links, metadata and system state. Diffs use amber for removals and cyan for
additions plus explicit `+`/`-` glyphs, so nothing depends on colour alone.
IBM Plex Sans for UI, JetBrains Mono reserved for code, paths and technical
metadata. `prefers-reduced-motion` is honoured throughout.

**Architecture note.** The frontend stays on Vite + React Router rather than
migrating to Next.js. The product is a fully client-side authenticated
workspace talking to a separate FastAPI service, so SSR and API routes buy
nothing, while SSE streaming, `localStorage` persistence, the OAuth redirect
handshake and lazy Mermaid loading would all need re-verification. Crawlable
content is served via real markup plus a `noscript` fallback in `index.html`.

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
    ├── index.html                  # Meta tags, JSON-LD, noscript fallback
    ├── tailwind.config.ts          # Design tokens
    ├── src/
    │   ├── index.css               # Palette, typography, component classes
    │   ├── App.tsx                 # Routes + providers
    │   ├── pages/
    │   │   ├── Workspace.tsx       # Source launcher / indexing / ready
    │   │   ├── Chat.tsx            # Three-pane chat workspace
    │   │   ├── Files.tsx           # Explorer + reader
    │   │   ├── Architecture.tsx    # Mermaid dependency graph
    │   │   ├── Pulls.tsx           # PR list, diff, diff-chat
    │   │   ├── Shared.tsx          # Share link management
    │   │   ├── Settings.tsx        # Connections, theme, session
    │   │   └── SharedSession.tsx   # /s/:id public read-only view
    │   ├── components/
    │   │   ├── shell/              # AppShell, Sidebar, TopBar, CommandPalette
    │   │   ├── source/             # GithubSource, LocalSource
    │   │   ├── chat/               # MessageRow, Composer
    │   │   ├── workspace/          # FileExplorer, CodePreview
    │   │   ├── pulls/              # DiffViewer
    │   │   ├── states/             # EmptyState, ErrorState, IndexingState
    │   │   ├── MessageFormatter.tsx
    │   │   ├── MermaidBlock.tsx
    │   │   ├── FileViewer.tsx      # Modal wrapper around CodePreview
    │   │   ├── ErrorBoundary.tsx
    │   │   └── ThemeToggle.tsx
    │   ├── hooks/
    │   │   ├── useChat.ts          # Send / stream / stop / retry
    │   │   ├── useChatHistory.ts   # localStorage persistence
    │   │   └── useGithubAuth.ts    # OAuth status
    │   ├── lib/
    │   │   ├── citations.ts        # [file:line] parsing + React-tree walker
    │   │   ├── codeTheme.ts        # Prism theme built from design tokens
    │   │   ├── mermaid.ts          # Lazy, theme-aware Mermaid singleton
    │   │   ├── shares.ts           # Local share registry
    │   │   └── exportChat.ts       # Markdown / JSON export
    │   ├── contexts/SessionContext.tsx  # Session state + indexing poll
    │   └── services/api.ts         # Typed backend client (incl. SSE)
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

**Pull requests**
- `GET /pulls?state=open` — list PRs on the connected repo
- `GET /pulls/{n}` — PR metadata, changed files with patches, review comments
- `POST /pulls/resolve` — turn a PR URL into `{owner, repo, number}`
- `POST /pulls/{n}/chat` — ask about a diff (diff + RAG context combined)
- `POST /pulls/{n}/review` — generated review: summary, risks, what to look at

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

# Feature tests: Groq pool, history compression, streaming, citations, graph
python tests/test_features.py       # 15 tests

# Pull requests + session source metadata (GitHub calls are mocked)
python tests/test_pulls.py          # 15 tests

# Full end-to-end: clones a real repo, embeds, queries, streams
python tests/test_e2e.py            # Skips if API keys missing
```

Frontend checks:

```bash
cd frontend
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json   # types
npm run lint
npm run build
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

**Streaming shows nothing, then everything at once** → your reverse proxy is buffering SSE. On Nginx add `proxy_buffering off` for the `/chat/stream` route. Render doesn't need any tweak. The client falls back to the blocking `/chat` endpoint if the stream yields nothing, so answers still arrive either way.

**Pull requests tab is disabled** → it needs a GitHub-backed session. Sessions created from local uploads have no remote to read PRs from.

**OAuth redirects to the wrong port** → `FRONTEND_URL` defaults to `http://localhost:8080` because that's what this project's Vite config uses. Set it explicitly if you changed the port.

**Rate-limited by Groq** → add more keys to `GROQ_API_KEYS` (comma-separated). The pool auto-rotates and cools down 429'd keys for 60s.

---

## Roadmap

- Query rewriting with a fast model — expand vague queries before embedding
- Code-aware embeddings — swap `multilingual-e5-large` for `voyage-code-3` or `jina-embeddings-v2-base-code`
- Per-user sessions — replace the single-process in-memory store with Redis-backed sessions

---

## License

MIT
