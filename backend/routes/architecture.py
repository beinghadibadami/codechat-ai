"""
Architecture diagram routes.

Given the current session's uploaded repo, build a dependency graph and
return it as Mermaid syntax plus a structured node/edge payload. The
frontend renders the Mermaid text with mermaid.js.
"""
from fastapi import APIRouter, HTTPException

from services import session_service
from services.graph_builder import build_dependency_graph

router = APIRouter(tags=["architecture"])


@router.get("/architecture")
def get_architecture(max_nodes: int = 50, include_tests: bool = False):
    """
    Return an architecture diagram for the current session's codebase.

    Query params:
        max_nodes: cap on nodes rendered (top N by connectivity). 50 default.
        include_tests: include test files in the graph. False by default.
    """
    if not session_service.has_data():
        raise HTTPException(
            status_code=400,
            detail="No code repository loaded. Upload files or connect a GitHub repo first.",
        )

    root = session_service.get_session().get("path")
    graph = build_dependency_graph(
        root,
        max_nodes=max_nodes,
        exclude_tests=not include_tests,
    )
    return {"success": True, **graph}
