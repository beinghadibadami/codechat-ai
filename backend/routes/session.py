"""
Session management routes
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from models.schemas import SessionInfoResponse
from services import session_service

router = APIRouter(tags=["session"])


@router.get("/session-info", response_model=SessionInfoResponse)
def get_session_info():
    """Get current session information"""
    session = session_service.get_session()
    has_data = session_service.has_data()
    
    return {
        "namespace": session["namespace"],
        "has_data": has_data,
        "files_processed": session.get("files_processed", 0),
        "features": {
            "hosted_embeddings": True,
            "reranking": True,
            "dynamic_topk": True,
            "token_management": True
        }
    }


@router.post("/reset-session")
async def reset_session():
    """Reset session with cleanup"""
    session = session_service.reset_session()
    
    return JSONResponse({
        "success": True,
        "message": "Session reset successfully",
        "namespace": session["namespace"]
    })
