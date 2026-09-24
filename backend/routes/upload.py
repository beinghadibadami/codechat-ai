"""
File and GitHub upload routes
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
import tempfile
import os
import json

from config import settings
from models.schemas import UploadResponse, GitHubUploadRequest
from services import session_service, get_pinecone_manager
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


@router.post("/upload-file", response_model=UploadResponse)
async def upload_files(
    files: List[UploadFile] = File(...),
    config: Optional[str] = Form(None)
):
    """
    Upload files and process them for RAG
    
    Args:
        files: List of files to upload
        config: Optional JSON config for chunking parameters
    """
    session = session_service.get_session()
    pinecone_manager = get_pinecone_manager()

    # Parse config if provided
    chunk_size = settings.DEFAULT_CHUNK_SIZE
    chunk_overlap = settings.DEFAULT_CHUNK_OVERLAP
    
    if config:
        try:
            config_data = json.loads(config)
            chunk_size = config_data.get('chunk_size', chunk_size)
            chunk_overlap = config_data.get('chunk_overlap', chunk_overlap)
        except Exception as e:
            print(f"Warning: Failed to parse config: {e}")
    
    temp_dir = tempfile.mkdtemp(dir=settings.DATA_DIR)
    session_service.update_session(
        path=temp_dir,
        source_type="upload",
        repo_name=f"{len(files)} local file{'s' if len(files) != 1 else ''}",
        indexing=True,
    )

    try:
        # Save uploaded files
        for file in files:
            file_path = os.path.join(temp_dir, file.filename)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, "wb") as f:
                contents = await file.read()
                f.write(contents)
        
        # Load and filter documents
        documents, stats = load_code_files_detailed(temp_dir)
        print(f"[LOAD] {stats.as_dict()}")
        if not documents:
            raise HTTPException(status_code=400, detail=_no_files_detail(stats))

        total_chunks = 0
        processed_files = 0
        truncated = False

        for doc in documents:
            if total_chunks >= MAX_TOTAL_CHUNKS:
                truncated = True
                break

            file_path = getattr(doc, 'metadata', {}).get('source', 'unknown')
            if hasattr(doc, 'source'):
                file_path = doc.source

            chunks = pinecone_manager.chunk_documents([doc], chunk_size, chunk_overlap)

            if chunks:
                success = pinecone_manager.upsert_documents(
                    chunks,
                    session["namespace"],
                    file_path
                )

                if success:
                    total_chunks += len(chunks)
                    processed_files += 1
                    print(f"[OK] Processed {os.path.basename(file_path)}: {len(chunks)} chunks")

        session_service.update_session(
            files_processed=processed_files,
            repo_name=f"{processed_files} local file{'s' if processed_files != 1 else ''}",
            indexing=False,
        )

        message = f"Indexed {total_chunks} chunks from {processed_files} files"
        if stats.skipped_total:
            message += f" ({stats.skipped_total} files filtered out)"
        if truncated:
            message += f". Stopped at the {MAX_TOTAL_CHUNKS}-chunk limit"

        return {
            "success": True,
            "message": message,
            "namespace": session["namespace"],
            "config": {"chunk_size": chunk_size, "chunk_overlap": chunk_overlap},
            "load_stats": stats.as_dict(),
        }

    except HTTPException:
        session_service.update_session(indexing=False)
        raise
    except Exception as e:
        session_service.update_session(indexing=False)
        print(f"[ERROR] upload_files failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-github")
async def upload_github(
    repo_url: str = Form(...),
    token: Optional[str] = Form(None),
    chunk_size: int = Form(settings.DEFAULT_CHUNK_SIZE),
    chunk_overlap: int = Form(settings.DEFAULT_CHUNK_OVERLAP)
):
    """
    Clone and process a GitHub repository (public or private).

    Args:
        repo_url: GitHub repository URL
        token: Optional GitHub Personal Access Token for private repos.
               The token is used once for the clone and never stored.
        chunk_size: Size of text chunks
        chunk_overlap: Overlap between chunks
    """
    session = session_service.get_session()
    pinecone_manager = get_pinecone_manager()

    # Auth priority:
    #   1. PAT provided in this specific request (form field) — takes precedence
    #   2. Otherwise, use the OAuth token from session if the user connected GitHub
    #   3. Otherwise, no token — public repos only
    effective_token = token or session_service.get_github_token()

    # Record source metadata up front so the UI can show "indexing <repo>"
    session_service.update_session(
        source_type="github",
        repo_url=repo_url,
        repo_name=repo_display_name(repo_url) or repo_url,
        indexing=True,
    )

    try:
        # Clone into managed data directory (token used once, not logged)
        try:
            folder = clone_repo(repo_url, base_dir=settings.DATA_DIR, token=effective_token)
        except ValueError as clone_err:
            # Friendly error messages from clone_repo bubble up as 400
            session_service.update_session(indexing=False)
            raise HTTPException(status_code=400, detail=str(clone_err))
        session_service.update_session(path=folder)
        
        documents, stats = load_code_files_detailed(folder)
        print(f"[LOAD] {stats.as_dict()}")
        if not documents:
            raise HTTPException(status_code=400, detail=_no_files_detail(stats))

        all_chunks = []
        processed_files = 0
        truncated = False

        for doc in documents:
            if len(all_chunks) >= MAX_TOTAL_CHUNKS:
                truncated = True
                break

            file_path = getattr(doc, 'metadata', {}).get('source', 'unknown')
            if hasattr(doc, 'source'):
                file_path = doc.source

            chunks = pinecone_manager.chunk_documents([doc], chunk_size, chunk_overlap)

            # Add file info to each chunk
            for chunk in chunks:
                chunk.metadata.update({
                    'file_path': file_path,
                    'file_name': os.path.basename(file_path),
                    'language': pinecone_manager._get_file_type(file_path)
                })

            all_chunks.extend(chunks)
            processed_files += 1

        # Batch upsert all chunks
        if all_chunks:
            pinecone_manager.batch_upsert_documents(all_chunks, session["namespace"])
            print(f"[OK] Batch upserted {len(all_chunks)} chunks from {processed_files} files")

        session_service.update_session(files_processed=processed_files, indexing=False)

        message = f"Indexed {len(all_chunks)} chunks from {processed_files} files"
        if stats.skipped_total:
            message += f" ({stats.skipped_total} files filtered out)"
        if truncated:
            message += f". Stopped at the {MAX_TOTAL_CHUNKS}-chunk limit"

        return JSONResponse({
            "success": True,
            "message": message,
            "namespace": session["namespace"],
            "load_stats": stats.as_dict(),
        })

    except HTTPException:
        session_service.update_session(indexing=False)
        raise
    except Exception as e:
        session_service.update_session(indexing=False)
        print(f"[ERROR] upload_github failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
