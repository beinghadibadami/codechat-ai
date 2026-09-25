"""
Repo cache routes — surfaces recently indexed repositories so the connect
screen can offer one-click reuse (which reattaches to cached vectors).
"""
from fastapi import APIRouter

from services import repo_cache_service

router = APIRouter(tags=["repos"])


@router.get("/recent-repos")
def recent_repos():
    """Recently indexed, non-expired repos. Empty when caching isn't configured."""
    return {
        "configured": repo_cache_service.is_configured(),
        "repos": repo_cache_service.list_recent(limit=8),
    }
