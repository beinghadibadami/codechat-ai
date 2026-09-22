"""
Share routes — create and view read-only conversation snapshots.
"""
from typing import List, Optional, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import session_service, build_chat_context, query_llm, get_pinecone_manager
from services.share_service import (
    create_shared_session,
    load_shared_session,
    is_configured,
)
from services.file_service import build_file_tree, count_files_in_tree

router = APIRouter(prefix="/share", tags=["share"])


# ------- Request models --------------------------------------------------

class ShareCreateMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str
    metadata: Optional[Dict] = None


class ShareCreateRequest(BaseModel):
    """
    Payload the frontend sends when the user clicks "Share".
    We snapshot: current namespace, repo info, file tree, and chat messages.
    """
    repo_url: Optional[str] = None
    repo_name: Optional[str] = None
    messages: List[ShareCreateMessage] = Field(default_factory=list, max_length=200)


class ShareChatRequest(BaseModel):
    """Chat against a shared session's namespace (read-only forks)."""
    message: str = Field(..., min_length=1, max_length=2000)
    history: Optional[List[ShareCreateMessage]] = Field(default=None, max_length=20)


# ------- Routes ----------------------------------------------------------

@router.post("/create")
async def create_share(request: ShareCreateRequest):
    """
    Snapshot the caller's current session (namespace + file tree) and their
    posted messages into Supabase. Returns the new share id.
    """
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Sharing is not configured on this server. Admin needs SUPABASE_URL and SUPABASE_KEY.",
        )

    if not session_service.has_data():
        raise HTTPException(
            status_code=400,
            detail="No active session to share. Upload code first.",
        )

    session = session_service.get_session()
    namespace = session.get("namespace")

    # Build file tree from the current session's directory
    file_tree = build_file_tree(session.get("path") or "")

    share_id = create_shared_session(
        namespace=namespace,
        repo_url=request.repo_url,
        repo_name=request.repo_name,
        file_tree=file_tree,
        messages=[m.model_dump() for m in request.messages],
    )
    if not share_id:
        raise HTTPException(status_code=500, detail="Failed to create share")

    return {"success": True, "share_id": share_id}


@router.get("/{share_id}")
async def get_share(share_id: str):
    """Return a shared session + its messages (read-only)."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="Sharing not configured")

    data = load_shared_session(share_id)
    if not data:
        raise HTTPException(status_code=404, detail="Share not found")

    # Don't leak the raw namespace to the client — they don't need it
    return {
        "success": True,
        "id": data["id"],
        "repo_url": data.get("repo_url"),
        "repo_name": data.get("repo_name"),
        "file_tree": data.get("file_tree") or [],
        "total_files": count_files_in_tree(data.get("file_tree") or []),
        "messages": data.get("messages") or [],
        "view_count": data.get("view_count", 0),
        "created_at": data.get("created_at"),
    }


@router.post("/{share_id}/chat")
async def chat_on_share(share_id: str, request: ShareChatRequest):
    """
    Allow a viewer to ask a NEW question against the shared codebase.

    We retrieve from the shared session's Pinecone namespace but don't
    persist the new turn back to Supabase. This is a "read-only fork":
    each viewer can chat, but only the original owner's messages are
    saved into the share.
    """
    if not is_configured():
        raise HTTPException(status_code=503, detail="Sharing not configured")

    data = load_shared_session(share_id)
    if not data:
        raise HTTPException(status_code=404, detail="Share not found")

    namespace = data.get("namespace")
    if not namespace:
        raise HTTPException(status_code=500, detail="Share has no namespace")

    pinecone_manager = get_pinecone_manager()
    retrieved = pinecone_manager.smart_retrieve(
        query=request.message,
        namespace=namespace,
        max_tokens=None,
    )
    if not retrieved:
        return {
            "success": True,
            "response": "I couldn't find relevant information in the shared codebase.",
            "metadata": {"chunks_found": 0},
        }

    query_analysis = pinecone_manager.query_analyzer.analyze_query(request.message)
    query_type_map = {
        "specific": "simple", "general": "general",
        "summary": "complex", "analysis": "complex", "bug_check": "complex",
    }
    query_type = query_type_map.get(query_analysis["intent"], "general")

    enhanced_query, file_summary = build_chat_context(retrieved, request.message)
    history_dicts = None
    if request.history:
        history_dicts = [
            {"role": h.role, "content": h.content}
            for h in request.history
        ]

    response = query_llm(enhanced_query, query_type=query_type, history=history_dicts)

    return {
        "success": True,
        "response": response,
        "metadata": {
            "chunks_found": len(retrieved),
            "files_involved": len(file_summary),
            "file_summary": file_summary,
            "retrieval_reranked": retrieved[0].get("reranked", False) if retrieved else False,
            "sources": [
                {
                    "file_name": c.get("file_name"),
                    "file_path": c.get("file_path"),
                    "language": c.get("language"),
                    "line_start": c.get("line_start"),
                    "line_end": c.get("line_end"),
                    "score": c.get("score"),
                }
                for c in retrieved
            ],
        },
    }
