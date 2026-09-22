"""
File tree and file explanation routes
"""
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from typing import Dict
import os

from models.schemas import FileExplainRequest
from services import (
    session_service,
    build_file_tree,
    find_file_in_repo,
    read_file_with_limit,
    count_files_in_tree,
    build_file_explain_prompt,
    query_llm,
    get_pinecone_manager,
)

router = APIRouter(tags=["files"])


@router.get("/file-content")
def get_file_content(path: str, max_lines: int = 5000):
    """
    Return the raw text of a file from the current session's repo.

    Used by the frontend citation viewer to jump to a specific line.
    Path is resolved against the session's temp directory — walking
    outside of it is rejected.
    """
    session = session_service.get_session()
    root = session.get("path")
    if not root or not os.path.exists(root):
        raise HTTPException(status_code=400, detail="No code repository loaded")

    abs_path = find_file_in_repo(root, path)
    if not abs_path:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    # Defense: refuse anything outside the session root
    try:
        real_root = os.path.realpath(root)
        real_file = os.path.realpath(abs_path)
        if not real_file.startswith(real_root + os.sep) and real_file != real_root:
            raise HTTPException(status_code=403, detail="Path escapes session root")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read file: {e}")

    total = len(lines)
    truncated = total > max_lines
    if truncated:
        lines = lines[:max_lines]

    return {
        "success": True,
        "file_name": os.path.basename(abs_path),
        "file_path": path,
        "content": "".join(lines),
        "total_lines": total,
        "returned_lines": len(lines),
        "truncated": truncated,
    }


@router.get("/file-tree")
def get_file_tree():
    """Get file tree structure of uploaded/cloned code"""
    session = session_service.get_session()
    folder = session.get("path")
    
    if not folder or not os.path.exists(folder):
        return JSONResponse({
            "success": False,
            "tree": [],
            "message": "No files uploaded yet"
        })
    
    try:
        tree = build_file_tree(folder)
        if not tree:
            return JSONResponse({
                "success": False,
                "tree": [],
                "message": "No files found in repository"
            })
        
        # Count actual files in the tree
        file_count = count_files_in_tree(tree)
        
        return JSONResponse({
            "success": True,
            "tree": tree,
            "root_path": folder,
            "total_files": file_count,
            "files_processed": session.get("files_processed", 0)
        })
    except Exception as e:
        print(f"Error building file tree: {e}")
        return JSONResponse({
            "success": False,
            "tree": [],
            "error": str(e)
        })


@router.post("/explain-file")
async def explain_file(request: Dict = Body(...)):
    """
    Explain a specific file from the uploaded codebase
    
    Args:
        request: Dictionary with file_path key
    """
    try:
        file_path = request.get("file_path")
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        session = session_service.get_session()
        folder = session.get("path")
        
        if not folder or not os.path.exists(folder):
            raise HTTPException(status_code=400, detail="No code repository loaded")
        
        # Find the actual file
        abs_path = find_file_in_repo(folder, file_path)
        if not abs_path:
            return JSONResponse({
                "success": False,
                "response": f"File '{file_path}' not found in the repository",
                "metadata": {"source": "file_not_found"}
            })
        
        # Try embedded explanation first, fallback to direct read
        result = await try_embedded_explanation(abs_path, file_path, session)
        if result:
            return result
        
        return await try_direct_explanation(abs_path)
        
    except Exception as e:
        print(f"[ERROR] explain_file failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def try_embedded_explanation(abs_path: str, file_path: str, session: Dict):
    """Try to explain using embedded chunks first"""
    try:
        pinecone_manager = get_pinecone_manager()
        # Search for chunks from this specific file
        search_query = f"file:{os.path.basename(abs_path)} content"
        results = pinecone_manager.smart_retrieve(
            query=search_query,
            namespace=session["namespace"],
            max_tokens=8000
        )
        
        # Filter to only chunks from this file
        file_chunks = [
            chunk for chunk in results 
            if chunk.get('file_path', '').endswith(abs_path.replace(session["path"], ''))
        ]
        
        if not file_chunks:
            return None  # No embedded chunks found
        
        # Build context from embedded chunks
        context = "\n\n---\n\n".join([chunk['text'] for chunk in file_chunks])
        file_name = os.path.basename(abs_path)
        
        prompt = build_file_explain_prompt(file_name, context, is_embedded=True)
        response = query_llm(prompt, query_type="general")
        
        return JSONResponse({
            "success": True,
            "response": response,
            "metadata": {
                "source": "embedded",
                "file_name": file_name,
                "chunks_used": len(file_chunks),
                "method": "vector_search"
            }
        })
        
    except Exception as e:
        print(f"Error in embedded explanation: {e}")
        return None


async def try_direct_explanation(abs_path: str):
    """Fallback to direct file reading"""
    try:
        content = read_file_with_limit(abs_path, max_size_kb=150, max_lines=600)
        
        if not content:
            return JSONResponse({
                "success": False,
                "response": f"Could not read file {os.path.basename(abs_path)}. It may be binary or corrupted.",
                "metadata": {"source": "read_error"}
            })
        
        file_name = os.path.basename(abs_path)
        file_size_kb = os.path.getsize(abs_path) // 1024
        is_truncated = "truncated" in content.lower()
        
        prompt = build_file_explain_prompt(file_name, content, is_embedded=False)
        response = query_llm(prompt, query_type="general")
        
        return JSONResponse({
            "success": True,
            "response": response,
            "metadata": {
                "source": "direct_read",
                "file_name": file_name,
                "file_size_kb": file_size_kb,
                "was_truncated": is_truncated,
                "method": "direct_file_read"
            }
        })
        
    except Exception as e:
        print(f"Error in direct explanation: {e}")
        return JSONResponse({
            "success": False,
            "response": f"Error reading file: {str(e)}",
            "metadata": {"source": "error"}
        })
