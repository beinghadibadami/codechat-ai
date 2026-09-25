"""
Session management routes
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from models.schemas import SessionInfoResponse
from services import session_service, get_pinecone_manager
from services import repo_cache_service

router = APIRouter(tags=["session"])


@router.get("/session-info", response_model=SessionInfoResponse)
def get_session_info():
    """Current session state — drives the top bar and sidebar in the UI."""
    session = session_service.get_session()
    has_data = session_service.has_data()

    return {
        "namespace": session["namespace"],
        "has_data": has_data,
        "files_processed": session.get("files_processed", 0),
        "source_type": session.get("source_type"),
        "repo_url": session.get("repo_url"),
        "repo_name": session.get("repo_name"),
        "indexing": session.get("indexing", False),
        "index_progress": session.get("index_progress"),
        "github_user": session.get("github_user"),
        "features": {
            "hosted_embeddings": True,
            "reranking": True,
            "dynamic_topk": True,
            "token_management": True
        }
    }


@router.post("/reset-session")
async def reset_session():
    """
    Reset the session and clean up its resources.

    Deletes the old namespace's vectors from Pinecone so disconnected
    codebases don't linger in the index, then rotates to a fresh session
    (which also removes the cloned/uploaded files on disk).
    """
    old_namespace = session_service.get_session().get("namespace")

    # Pinecone cleanup — best effort, never block the reset on it. Cached repos
    # keep their vectors for reuse; only uncached namespaces are wiped here.
    if old_namespace and not repo_cache_service.is_cached_namespace(old_namespace):
        try:
            get_pinecone_manager().delete_namespace(old_namespace)
        except Exception as e:
            print(f"[WARN] Pinecone cleanup on reset failed: {e}")

    session = session_service.reset_session()

    return JSONResponse({
        "success": True,
        "message": "Session reset successfully",
        "namespace": session["namespace"]
    })
