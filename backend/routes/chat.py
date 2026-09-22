"""
Chat routes — blocking and streaming.

Both routes share the same retrieval + context build pipeline. Only the
final LLM call differs.
"""
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from models.schemas import QueryRequest, ChatResponse
from query_llm import ask_llm_stream
from services import (
    session_service,
    build_chat_context,
    query_llm,
    compress_history,
    get_pinecone_manager,
)

router = APIRouter(tags=["chat"])


# ------- Shared pipeline -------------------------------------------------

def _prepare_chat(request: QueryRequest):
    """
    Run retrieval + context build. Returns a dict of everything needed to
    call the LLM, or a JSONResponse if we should short-circuit (no data,
    no chunks retrieved).
    """
    session = session_service.get_session()
    pinecone_manager = get_pinecone_manager()

    if not session_service.has_data():
        return JSONResponse({
            "success": False,
            "response": "No code repository has been uploaded yet. Please upload files or connect a GitHub repository first.",
            "metadata": {"chunks_found": 0},
        })

    retrieved_chunks = pinecone_manager.smart_retrieve(
        query=request.message,
        namespace=session["namespace"],
        max_tokens=request.max_tokens,
    )

    if not retrieved_chunks:
        return JSONResponse({
            "success": True,
            "response": "I couldn't find relevant information in the uploaded code. Please try rephrasing your question or check if files were properly uploaded.",
            "metadata": {"chunks_found": 0},
        })

    query_analysis = pinecone_manager.query_analyzer.analyze_query(request.message)
    query_type_map = {
        'specific': 'simple',
        'general': 'general',
        'summary': 'complex',
        'analysis': 'complex',
        'bug_check': 'complex',
    }
    query_type = query_type_map.get(query_analysis['intent'], 'general')

    enhanced_query, file_summary = build_chat_context(retrieved_chunks, request.message)

    # Convert Pydantic history to plain dicts, then compress if long
    history_dicts = None
    if request.history:
        raw = [{"role": h.role, "content": h.content} for h in request.history]
        history_dicts = compress_history(raw)

    metadata = {
        "chunks_found": len(retrieved_chunks),
        "files_involved": len(file_summary),
        "file_summary": file_summary,
        "retrieval_reranked": retrieved_chunks[0].get('reranked', False) if retrieved_chunks else False,
        # Include citation-friendly source list: [{ file_name, file_path, line_start, line_end }]
        "sources": [
            {
                "file_name": c.get("file_name"),
                "file_path": c.get("file_path"),
                "language": c.get("language"),
                "line_start": c.get("line_start"),
                "line_end": c.get("line_end"),
                "score": c.get("score"),
            }
            for c in retrieved_chunks
        ],
    }

    return {
        "prompt": enhanced_query,
        "query_type": query_type,
        "history": history_dicts,
        "metadata": metadata,
    }


# ------- Blocking chat ---------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
async def chat(request: QueryRequest):
    """Blocking chat — returns the full response as one JSON payload."""
    try:
        prep = _prepare_chat(request)
        if isinstance(prep, JSONResponse):
            return prep

        response = query_llm(prep["prompt"], query_type=prep["query_type"], history=prep["history"])

        return JSONResponse({
            "success": True,
            "response": response,
            "metadata": prep["metadata"],
        })
    except Exception as e:
        print(f"[ERROR] chat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ------- Streaming chat --------------------------------------------------

def _sse(event: str, data: dict) -> str:
    """Format one Server-Sent Events frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat/stream")
async def chat_stream(request: QueryRequest):
    """
    Streaming chat via Server-Sent Events.

    Wire format:
        event: metadata
        data: {"chunks_found": 12, "files_involved": 4, "sources": [...]}

        event: token
        data: {"text": "Hello"}

        event: token
        data: {"text": " world"}

        event: done
        data: {}

    On error:
        event: error
        data: {"message": "..."}
    """
    prep = _prepare_chat(request)

    # Short-circuit responses come back as full JSON — convert to a single
    # "message" event so the frontend can display them uniformly.
    if isinstance(prep, JSONResponse):
        body = json.loads(prep.body.decode())

        def short_circuit_stream():
            yield _sse("metadata", body.get("metadata", {}))
            yield _sse("token", {"text": body.get("response", "")})
            yield _sse("done", {})

        return StreamingResponse(short_circuit_stream(), media_type="text/event-stream")

    def event_stream():
        try:
            # Send retrieval metadata first so the UI can show sources
            # even before the answer starts arriving
            yield _sse("metadata", prep["metadata"])

            for delta in ask_llm_stream(
                prep["prompt"],
                query_type=prep["query_type"],
                history=prep["history"],
            ):
                yield _sse("token", {"text": delta})

            yield _sse("done", {})
        except Exception as e:
            print(f"[ERROR] stream failed: {e}")
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable Nginx/Cloudflare buffering
        },
    )
