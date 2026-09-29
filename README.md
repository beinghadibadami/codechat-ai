# CodeChat AI

AI-powered code analysis with RAG. Upload a codebase or connect a GitHub repo, then chat with it — get summaries, find bugs, understand architecture, all grounded in your actual code.

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

## Roadmap

- Query rewriting with a fast model — expand vague queries before embedding
- Code-aware embeddings — swap `multilingual-e5-large` for `voyage-code-3` or `jina-embeddings-v2-base-code`
- Per-user sessions — replace the single-process in-memory store with Redis-backed sessions

---

## License

MIT
