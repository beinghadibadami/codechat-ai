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
from document_loader import clone_repo, load_code_files

router = APIRouter(tags=["upload"])


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
    session_service.update_session(path=temp_dir)
    
    try:
        # Save uploaded files
        for file in files:
            file_path = os.path.join(temp_dir, file.filename)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, "wb") as f:
                contents = await file.read()
                f.write(contents)
        
        # Load and process documents
        documents = load_code_files(temp_dir)
        if not documents:
            raise HTTPException(status_code=400, detail="No valid code files found")
        
        total_chunks = 0
        processed_files = 0
        
        for doc in documents:
            file_path = getattr(doc, 'metadata', {}).get('source', 'unknown')
            if hasattr(doc, 'source'):
                file_path = doc.source
            
            # Enhanced chunking
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
        
        session_service.update_session(files_processed=processed_files)
        
        return {
            "success": True,
            "message": f"Processed {total_chunks} chunks from {processed_files} files",
            "namespace": session["namespace"],
            "config": {"chunk_size": chunk_size, "chunk_overlap": chunk_overlap}
        }
        
    except Exception as e:
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

    try:
        # Clone into managed data directory (token used once, not logged)
        try:
            folder = clone_repo(repo_url, base_dir=settings.DATA_DIR, token=effective_token)
        except ValueError as clone_err:
            # Friendly error messages from clone_repo bubble up as 400
            raise HTTPException(status_code=400, detail=str(clone_err))
        session_service.update_session(path=folder)
        
        documents = load_code_files(folder)
        if not documents:
            raise HTTPException(status_code=400, detail="No valid code files found in repository")
        
        all_chunks = []
        processed_files = 0
        
        for doc in documents:
            file_path = getattr(doc, 'metadata', {}).get('source', 'unknown')
            if hasattr(doc, 'source'):
                file_path = doc.source
            
            chunks = pinecone_manager.chunk_documents([doc])
            
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
            success = pinecone_manager.batch_upsert_documents(
                all_chunks, 
                session["namespace"]
            )
            print(f"[OK] Batch upserted {len(all_chunks)} chunks from {processed_files} files")
        
        session_service.update_session(files_processed=processed_files)
        
        return JSONResponse({
            "success": True,
            "message": f"Repository processed: {len(all_chunks)} chunks from {processed_files} files",
            "namespace": session["namespace"]
        })
    
    except Exception as e:
        print(f"[ERROR] upload_github failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
