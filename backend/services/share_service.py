"""
Shareable session service — persists Q&A snapshots to Supabase so users
can share a read-only URL of their conversation.

Schema (run in Supabase SQL editor before use):

    create table shared_sessions (
        id uuid primary key default gen_random_uuid(),
        namespace text not null,
        repo_url text,
        repo_name text,
        file_tree jsonb,
        created_at timestamptz default now(),
        expires_at timestamptz,
        view_count int default 0,
        is_public boolean default true
    );

    create table shared_messages (
        id uuid primary key default gen_random_uuid(),
        session_id uuid references shared_sessions(id) on delete cascade,
        role text check (role in ('user', 'assistant')),
        content text,
        metadata jsonb,
        position int default 0,
        created_at timestamptz default now()
    );

Everything degrades gracefully if SUPABASE_URL / SUPABASE_KEY aren't set —
the endpoints will just return 503.
"""
from typing import List, Dict, Optional, Any

from config import settings

_client = None


def _get_client():
    """Lazy Supabase client init. Returns None if not configured."""
    global _client
    if _client is not None:
        return _client
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        return None
    try:
        from supabase import create_client
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return _client
    except Exception as e:
        print(f"[share_service] Supabase init failed: {e}")
        return None


def is_configured() -> bool:
    """True iff Supabase env vars are set."""
    return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)


def create_shared_session(
    namespace: str,
    repo_url: Optional[str],
    repo_name: Optional[str],
    file_tree: Optional[list],
    messages: List[Dict],
) -> Optional[str]:
    """
    Persist a session + its messages. Returns the new share id, or None
    on failure.
    """
    client = _get_client()
    if not client:
        return None

    try:
        # 1. Create the session row
        session_row = {
            "namespace": namespace,
            "repo_url": repo_url,
            "repo_name": repo_name,
            "file_tree": file_tree or [],
        }
        res = client.table("shared_sessions").insert(session_row).execute()
        if not res.data:
            print(f"[share_service] session insert returned no data")
            return None
        session_id = res.data[0]["id"]

        # 2. Insert messages in one batch, preserving order via `position`
        if messages:
            rows = []
            for i, m in enumerate(messages):
                role = m.get("role") or m.get("type")  # accept either key
                if role not in ("user", "assistant"):
                    continue
                rows.append({
                    "session_id": session_id,
                    "role": role,
                    "content": m.get("content", "") or "",
                    "metadata": m.get("metadata"),
                    "position": i,
                })
            if rows:
                client.table("shared_messages").insert(rows).execute()

        return session_id
    except Exception as e:
        print(f"[share_service] create_shared_session failed: {e}")
        return None


def load_shared_session(share_id: str) -> Optional[Dict[str, Any]]:
    """
    Load a share by id. Increments view_count as a side effect.
    Returns the session dict with an embedded `messages` list, or None.
    """
    client = _get_client()
    if not client:
        return None

    try:
        # Fetch session
        res = (
            client.table("shared_sessions")
            .select("*")
            .eq("id", share_id)
            .maybe_single()
            .execute()
        )
        if not res.data:
            return None
        session = res.data

        # Fetch ordered messages
        msg_res = (
            client.table("shared_messages")
            .select("*")
            .eq("session_id", share_id)
            .order("position")
            .execute()
        )
        session["messages"] = msg_res.data or []

        # Bump view count (fire and forget — don't block on this)
        try:
            client.table("shared_sessions").update(
                {"view_count": (session.get("view_count") or 0) + 1}
            ).eq("id", share_id).execute()
        except Exception:
            pass

        return session
    except Exception as e:
        print(f"[share_service] load_shared_session failed: {e}")
        return None
