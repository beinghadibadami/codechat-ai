"""
Repo cache — remembers which Pinecone namespace already holds a repo's vectors,
so re-picking that repo skips embedding entirely.

The vectors persist in Pinecone; only the (cheap) clone is redone to restore
files + the file tree. This maps `repo_url -> namespace` with a TTL. When the
TTL lapses, a sweep deletes the namespace from Pinecone so it doesn't leak.

Schema (run in the Supabase SQL editor before use):

    create table indexed_repos (
        id uuid primary key default gen_random_uuid(),
        repo_url text unique not null,
        repo_name text,
        namespace text not null,
        file_count int default 0,
        created_at timestamptz default now(),
        last_used_at timestamptz default now(),
        expires_at timestamptz not null
    );
    create index indexed_repos_expires_at_idx on indexed_repos (expires_at);

Degrades gracefully when Supabase isn't configured — caching is simply off and
every index runs the full clone + embed path.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from config import settings
# Reuse the same lazily-initialised Supabase client as the share feature.
from services.share_service import _get_client, is_configured  # noqa: F401

TTL_DAYS = settings.REPO_CACHE_TTL_DAYS


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expiry() -> str:
    return (_now() + timedelta(days=TTL_DAYS)).isoformat()


def _parse(ts: str) -> datetime:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return _now()  # unparseable → treat as fresh, don't wrongly expire


def record_index(repo_url: str, repo_name: Optional[str], namespace: str, file_count: int) -> None:
    """Remember (or refresh) a repo's namespace after a successful full index."""
    client = _get_client()
    if not client:
        return
    try:
        row = {
            "repo_url": repo_url,
            "repo_name": repo_name,
            "namespace": namespace,
            "file_count": file_count,
            "last_used_at": _now().isoformat(),
            "expires_at": _expiry(),
        }
        client.table("indexed_repos").upsert(row, on_conflict="repo_url").execute()
    except Exception as e:
        print(f"[repo_cache] record_index failed: {e}")


def find_cached(repo_url: str) -> Optional[Dict[str, Any]]:
    """Return a live (non-expired) cache row for the repo, or None."""
    client = _get_client()
    if not client:
        return None
    try:
        res = (
            client.table("indexed_repos")
            .select("*")
            .eq("repo_url", repo_url)
            .maybe_single()
            .execute()
        )
        row = res.data if res else None
        if not row:
            return None
        exp = row.get("expires_at")
        if exp and _parse(exp) < _now():
            return None  # expired — the sweep will remove it
        return row
    except Exception as e:
        print(f"[repo_cache] find_cached failed: {e}")
        return None


def touch(repo_url: str) -> None:
    """Bump last_used_at and extend the TTL on a cache hit."""
    client = _get_client()
    if not client:
        return
    try:
        client.table("indexed_repos").update({
            "last_used_at": _now().isoformat(),
            "expires_at": _expiry(),
        }).eq("repo_url", repo_url).execute()
    except Exception as e:
        print(f"[repo_cache] touch failed: {e}")


def list_recent(limit: int = 8) -> List[Dict[str, Any]]:
    """Recently used, non-expired repos for the connect screen's recents."""
    client = _get_client()
    if not client:
        return []
    try:
        res = (
            client.table("indexed_repos")
            .select("repo_url,repo_name,file_count,last_used_at")
            .gt("expires_at", _now().isoformat())
            .order("last_used_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"[repo_cache] list_recent failed: {e}")
        return []


def is_cached_namespace(namespace: str) -> bool:
    """True if a live cache row owns this namespace (so reset must not wipe it)."""
    client = _get_client()
    if not client or not namespace:
        return False
    try:
        res = (
            client.table("indexed_repos")
            .select("id")
            .eq("namespace", namespace)
            .gt("expires_at", _now().isoformat())
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        print(f"[repo_cache] is_cached_namespace failed: {e}")
        return False


def sweep_expired(pinecone_manager) -> int:
    """Delete expired namespaces from Pinecone and drop their rows."""
    client = _get_client()
    if not client:
        return 0
    try:
        res = (
            client.table("indexed_repos")
            .select("id,namespace")
            .lt("expires_at", _now().isoformat())
            .execute()
        )
        rows = res.data or []
        for r in rows:
            try:
                pinecone_manager.delete_namespace(r["namespace"])
            except Exception as e:
                print(f"[repo_cache] sweep delete ns failed: {e}")
            client.table("indexed_repos").delete().eq("id", r["id"]).execute()
        if rows:
            print(f"[repo_cache] swept {len(rows)} expired repo(s)")
        return len(rows)
    except Exception as e:
        print(f"[repo_cache] sweep failed: {e}")
        return 0
