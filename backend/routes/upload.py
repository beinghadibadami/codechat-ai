"""
File and GitHub upload routes.

Indexing runs asynchronously: the endpoint validates, saves any uploaded files,
flags the session as indexing, and hands the heavy work (clone → load → chunk →
embed) to a background task. The client polls /session-info for real progress
rather than blocking on a 30-60s request.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import List, Optional
import tempfile
import os
import json

from config import settings
from models.schemas import UploadResponse
from services import session_service, get_pinecone_manager
from services import repo_cache_service
from services.github_api import repo_display_name
from document_loader import clone_repo, load_code_files_detailed, LoadStats

router = APIRouter(tags=["upload"])

# Upper bound on vectors per session. Past this the index stops improving
# answers and starts diluting them, so we truncate and tell the user rather
# than silently writing thousands of low-value chunks.
MAX_TOTAL_CHUNKS = 3000


def _no_files_detail(stats: LoadStats) -> str:
    """
    Explain *why* nothing was indexed. "No valid code files found" is useless
    when the real reason is that everything was filtered.
    """
    if stats.skipped_total == 0:
        return "No files found. The repository or upload appears to be empty."

    reasons = []
    if stats.skipped_extension:
        reasons.append(f"{stats.skipped_extension} with unsupported file types")
    if stats.skipped_too_large:
        reasons.append(f"{stats.skipped_too_large} over the size limit")
    if stats.skipped_aggregate:
        reasons.append(f"{stats.skipped_aggregate} whole-repo dump files")
    if stats.skipped_binary:
        reasons.append(f"{stats.skipped_binary} binary")
    if stats.skipped_name:
        reasons.append(f"{stats.skipped_name} generated or config files")

    return (
        "No indexable source files found — "
        + ", ".join(reasons)
        + ". Check that the codebase contains source code rather than only "
          "assets, data, or generated output."
    )


# ---------------------------------------------------------------------------
# Shared indexing core — runs inside a background task (threadpool).
# ---------------------------------------------------------------------------

def _embed_documents(documents, namespace, chunk_size, chunk_overlap) -> tuple[int, int, bool]:
    """
    Chunk + concurrently embed a set of loaded documents into a namespace.

    Reports progress into the session as it goes. Returns
    (files_processed, chunks, truncated).
    """
    pm = get_pinecone_manager()

    # Clean slate so a new codebase never mixes with a previous one.
    pm.delete_namespace(namespace)

    all_chunks = []
    processed = 0
    truncated = False
    total_docs = len(documents)
    session_service.update_progress(phase="load", files_total=total_docs, files_done=0)

    for doc in documents:
        if len(all_chunks) >= MAX_TOTAL_CHUNKS:
            truncated = True
            break

        file_path = getattr(doc, 'metadata', {}).get('source', 'unknown')
        if hasattr(doc, 'source'):
            file_path = doc.source

        chunks = pm.chunk_documents([doc], chunk_size, chunk_overlap)
        for chunk in chunks:
            chunk.metadata.update({
                'file_path': file_path,
                'file_name': os.path.basename(file_path),
                'language': pm._get_file_type(file_path),
            })
        all_chunks.extend(chunks)
        processed += 1
        session_service.update_progress(files_done=processed)

    if all_chunks:
        session_service.update_progress(
            phase="embed", chunks_total=len(all_chunks), chunks_done=0
        )
        pm.batch_upsert_documents(
            all_chunks,
            namespace,
            on_progress=lambda done, total: session_service.update_progress(
                chunks_done=done, chunks_total=total
            ),
        )

    return processed, len(all_chunks), truncated


def _run_github_indexing(
    repo_url: str,
    repo_name: str,
    token: Optional[str],
    chunk_size: int,
    chunk_overlap: int,
):
    """Background worker: clone a repo, then chunk + embed it."""
    namespace = session_service.get_session()["namespace"]

    # Opportunistic cleanup of any TTL-expired repos (off the request path).
    try:
        repo_cache_service.sweep_expired(get_pinecone_manager())
    except Exception as e:
        print(f"[WARN] cache sweep failed: {e}")

    try:
        session_service.update_progress(phase="clone")
        try:
            folder = clone_repo(repo_url, base_dir=settings.DATA_DIR, token=token)
        except ValueError as clone_err:
            session_service.update_session(indexing=False)
            session_service.update_progress(phase="error", message=str(clone_err))
            return
        session_service.update_session(path=folder)

        session_service.update_progress(phase="load")
        documents, stats = load_code_files_detailed(folder)
        print(f"[LOAD] {stats.as_dict()}")
        if not documents:
            session_service.update_session(indexing=False)
            session_service.update_progress(phase="error", message=_no_files_detail(stats))
            return

        processed, chunks, truncated = _embed_documents(
            documents, namespace, chunk_size, chunk_overlap
        )

        session_service.update_session(files_processed=processed, indexing=False)
        session_service.update_progress(phase="done", files_done=processed)

        # Remember this repo's namespace so a re-pick skips embedding.
        repo_cache_service.record_index(repo_url, repo_name, namespace, processed)

        print(f"[OK] Indexed {chunks} chunks from {processed} files"
              + (" (truncated)" if truncated else ""))
    except Exception as e:
        session_service.update_session(indexing=False)
        session_service.update_progress(phase="error", message=str(e))
        print(f"[ERROR] github indexing failed: {e}")


def _run_reattach(repo_url: str, namespace: str, file_count: int, token: Optional[str]):
    """
    Background worker: reuse a cached namespace's vectors and only re-clone the
    files (for the tree + on-demand preview). No embedding — the vectors are
    already in Pinecone under `namespace`.
    """
    try:
        session_service.update_progress(phase="clone")
        try:
            folder = clone_repo(repo_url, base_dir=settings.DATA_DIR, token=token)
        except ValueError as clone_err:
            session_service.update_session(indexing=False)
            session_service.update_progress(phase="error", message=str(clone_err))
            return

        session_service.update_session(
            path=folder,
            files_processed=file_count,
            indexing=False,
        )
        session_service.update_progress(phase="done", files_done=file_count)
        repo_cache_service.touch(repo_url)
        print(f"[OK] Reattached '{repo_url}' to cached namespace (skipped embedding)")
    except Exception as e:
        session_service.update_session(indexing=False)
        session_service.update_progress(phase="error", message=str(e))
        print(f"[ERROR] reattach failed: {e}")


def _run_file_indexing(temp_dir: str, chunk_size: int, chunk_overlap: int):
    """Background worker: chunk + embed already-saved uploaded files."""
    namespace = session_service.get_session()["namespace"]
    try:
        session_service.update_progress(phase="load")
        documents, stats = load_code_files_detailed(temp_dir)
        print(f"[LOAD] {stats.as_dict()}")
        if not documents:
            session_service.update_session(indexing=False)
            session_service.update_progress(phase="error", message=_no_files_detail(stats))
            return

        processed, chunks, truncated = _embed_documents(
            documents, namespace, chunk_size, chunk_overlap
        )

        session_service.update_session(
            files_processed=processed,
            repo_name=f"{processed} local file{'s' if processed != 1 else ''}",
            indexing=False,
        )
        session_service.update_progress(phase="done", files_done=processed)
        print(f"[OK] Indexed {chunks} chunks from {processed} files"
              + (" (truncated)" if truncated else ""))
    except Exception as e:
        session_service.update_session(indexing=False)
        session_service.update_progress(phase="error", message=str(e))
        print(f"[ERROR] file indexing failed: {e}")


# ---------------------------------------------------------------------------
# Endpoints — validate, kick off the background task, return immediately.
# ---------------------------------------------------------------------------

@router.post("/upload-file", response_model=UploadResponse)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    config: Optional[str] = Form(None),
):
    """Save uploaded files, then index them in the background."""
    if session_service.is_indexing():
        raise HTTPException(
            status_code=409,
            detail="An index job is already running. Wait for it to finish or reset the session.",
        )

    chunk_size = settings.DEFAULT_CHUNK_SIZE
    chunk_overlap = settings.DEFAULT_CHUNK_OVERLAP
    if config:
        try:
            config_data = json.loads(config)
            chunk_size = config_data.get('chunk_size', chunk_size)
            chunk_overlap = config_data.get('chunk_overlap', chunk_overlap)
        except Exception as e:
            print(f"Warning: Failed to parse config: {e}")

    # Persist uploaded files now — the UploadFile streams are tied to this
    # request and won't be readable from the background task.
    temp_dir = tempfile.mkdtemp(dir=settings.DATA_DIR)
    try:
        for file in files:
            file_path = os.path.join(temp_dir, file.filename)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(await file.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploads: {e}")

    # Uploads aren't reproducible, so they get their own fresh namespace and are
    # never cached — a new session can't reattach to them.
    session_service.assign_new_namespace()
    session_service.update_session(
        path=temp_dir,
        source_type="upload",
        repo_name=f"{len(files)} local file{'s' if len(files) != 1 else ''}",
    )
    session_service.start_indexing()
    background_tasks.add_task(_run_file_indexing, temp_dir, chunk_size, chunk_overlap)

    return {
        "success": True,
        "message": "Indexing started",
        "namespace": session_service.get_session()["namespace"],
        "config": {"chunk_size": chunk_size, "chunk_overlap": chunk_overlap},
    }


@router.post("/upload-github")
async def upload_github(
    background_tasks: BackgroundTasks,
    repo_url: str = Form(...),
    token: Optional[str] = Form(None),
    chunk_size: int = Form(settings.DEFAULT_CHUNK_SIZE),
    chunk_overlap: int = Form(settings.DEFAULT_CHUNK_OVERLAP),
):
    """
    Clone and index a GitHub repository (public or private) in the background.

    Auth priority:
      1. PAT provided in this request (form field) — takes precedence
      2. OAuth token from the session if the user connected GitHub
      3. No token — public repos only
    The token is used once for the clone and never stored.
    """
    if session_service.is_indexing():
        raise HTTPException(
            status_code=409,
            detail="An index job is already running. Wait for it to finish or reset the session.",
        )

    effective_token = token or session_service.get_github_token()
    repo_name = repo_display_name(repo_url) or repo_url

    session_service.update_session(
        source_type="github",
        repo_url=repo_url,
        repo_name=repo_name,
    )

    # Cache hit → skip embedding, just re-clone the files and reuse the vectors.
    cached = repo_cache_service.find_cached(repo_url)
    if cached:
        session_service.set_namespace(cached["namespace"])
        session_service.start_indexing()
        background_tasks.add_task(
            _run_reattach,
            repo_url,
            cached["namespace"],
            cached.get("file_count", 0),
            effective_token,
        )
        return JSONResponse({
            "success": True,
            "message": "Reattaching to cached index",
            "namespace": cached["namespace"],
            "indexing": True,
            "cached": True,
        })

    # Cache miss → fresh namespace + full clone/embed.
    namespace = session_service.assign_new_namespace()
    session_service.start_indexing()
    background_tasks.add_task(
        _run_github_indexing, repo_url, repo_name, effective_token, chunk_size, chunk_overlap
    )

    return JSONResponse({
        "success": True,
        "message": "Indexing started",
        "namespace": namespace,
        "indexing": True,
        "cached": False,
    })
