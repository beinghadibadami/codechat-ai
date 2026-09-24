"""
GitHub REST API helpers — repository metadata and pull-request diffs.

Auth: uses the OAuth token stored on the session (see github_auth.py) or an
explicitly supplied PAT. Unauthenticated calls still work for public repos
but are rate-limited to 60/hour per IP, so we always prefer a token.

All functions return None / [] on failure rather than raising, except where
the caller needs to surface a specific message to the user.
"""
import re
from typing import Optional, Tuple, List, Dict, Any

import httpx

GITHUB_API = "https://api.github.com"
_HEADERS_BASE = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# Matches the repo portion of a GitHub URL, tolerating /tree/branch,
# trailing .git, trailing slash, and deep paths.
_REPO_URL_RE = re.compile(
    r"^https?://(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?(?:/.*)?/?$",
    re.IGNORECASE,
)

# Matches a PR URL: https://github.com/owner/repo/pull/123
_PR_URL_RE = re.compile(
    r"^https?://(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/pull/(\d+)",
    re.IGNORECASE,
)

# Matches a bare PR reference in free text: "#123" or "PR 123" or "pull/123"
_PR_REF_RE = re.compile(
    r"(?:\bPR[\s#-]*|\bpull(?:\s+request)?[\s#/-]*|#)(\d{1,6})\b",
    re.IGNORECASE,
)

# Matches an unnumbered reference to the newest PR: "latest PR", "most recent
# pull request", "last PR". Without this, "explain the latest pull request"
# silently fell through to plain RAG and the model would describe current code
# as if it were a diff — confidently, and wrongly.
_LATEST_PR_RE = re.compile(
    r"\b(?:latest|most\s+recent|newest|last|recent)\s+"
    r"(?:merged\s+|open\s+|closed\s+|new\s+)?"
    r"(?:PRs?|pull\s*requests?)\b",
    re.IGNORECASE,
)


def _headers(token: Optional[str]) -> Dict[str, str]:
    h = dict(_HEADERS_BASE)
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def parse_repo_url(url: str) -> Optional[Tuple[str, str]]:
    """Return (owner, repo) from a GitHub URL, or None if it doesn't match."""
    if not url:
        return None
    m = _REPO_URL_RE.match(url.strip())
    if not m:
        return None
    return m.group(1), m.group(2)


def repo_display_name(url: str) -> Optional[str]:
    """Return 'owner/repo' for display, or None."""
    parsed = parse_repo_url(url)
    return f"{parsed[0]}/{parsed[1]}" if parsed else None


def parse_pr_url(url: str) -> Optional[Tuple[str, str, int]]:
    """Return (owner, repo, number) from a PR URL, or None."""
    if not url:
        return None
    m = _PR_URL_RE.match(url.strip())
    if not m:
        return None
    return m.group(1), m.group(2), int(m.group(3))


def extract_pr_reference(text: str) -> Optional[int]:
    """
    Pull an explicit PR number out of free-form chat text.

    Recognises: "#123", "PR 123", "PR#123", "pull request 123", "pull/123".
    Returns the first match, or None. Deliberately conservative — we don't
    want to fetch a diff every time someone types a number.
    """
    if not text:
        return None
    m = _PR_REF_RE.search(text)
    return int(m.group(1)) if m else None


def wants_latest_pr(text: str) -> bool:
    """
    True when the user referred to the newest PR without giving a number,
    e.g. "explain the latest pull request".

    Checked only after extract_pr_reference() comes back empty, so an explicit
    number always wins.
    """
    if not text:
        return False
    return bool(_LATEST_PR_RE.search(text))


async def fetch_latest_pull_request(
    token: Optional[str],
    owner: str,
    repo: str,
    max_files: int = 40,
) -> Optional[Dict[str, Any]]:
    """
    Resolve "the latest PR" to a concrete diff.

    Looks at open PRs first since that's what people usually mean, then falls
    back to any state so a repo with nothing open still answers.
    """
    for state in ("open", "all"):
        listing = await list_pull_requests(token, owner, repo, state=state, limit=1)
        if listing:
            return await fetch_pull_request(
                token, owner, repo, listing[0]["number"], max_files=max_files
            )
    return None


async def list_pull_requests(
    token: Optional[str],
    owner: str,
    repo: str,
    state: str = "open",
    limit: int = 30,
) -> List[Dict[str, Any]]:
    """List PRs for a repo, newest first. Returns a trimmed payload."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/pulls"
    params = {"state": state, "per_page": min(limit, 100), "sort": "updated", "direction": "desc"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            r = await client.get(url, headers=_headers(token), params=params)
            if r.status_code != 200:
                print(f"[github_api] list_pull_requests {r.status_code}: {r.text[:180]}")
                return []
            return [
                {
                    "number": pr["number"],
                    "title": pr["title"],
                    "state": pr["state"],
                    "draft": pr.get("draft", False),
                    "author": (pr.get("user") or {}).get("login"),
                    "head": (pr.get("head") or {}).get("ref"),
                    "base": (pr.get("base") or {}).get("ref"),
                    "created_at": pr.get("created_at"),
                    "updated_at": pr.get("updated_at"),
                    "url": pr.get("html_url"),
                }
                for pr in r.json()
            ]
        except Exception as e:
            print(f"[github_api] list_pull_requests failed: {e}")
            return []


async def fetch_pull_request(
    token: Optional[str],
    owner: str,
    repo: str,
    number: int,
    max_files: int = 40,
    max_patch_chars: int = 20000,
) -> Optional[Dict[str, Any]]:
    """
    Fetch PR metadata + changed files with their unified-diff patches.

    Returns a dict shaped for both the UI and the LLM context builder, or
    None if the PR can't be reached.

    `max_patch_chars` caps the *total* patch text we keep so a giant PR can't
    blow past the model's context window. Files beyond the cap keep their
    stats but lose the patch body (flagged via `patch_omitted`).
    """
    base = f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            pr_resp = await client.get(base, headers=_headers(token))
            if pr_resp.status_code == 404:
                return None
            if pr_resp.status_code != 200:
                print(f"[github_api] fetch_pull_request {pr_resp.status_code}: {pr_resp.text[:180]}")
                return None
            pr = pr_resp.json()

            files_resp = await client.get(
                f"{base}/files",
                headers=_headers(token),
                params={"per_page": min(max_files, 100)},
            )
            files_raw = files_resp.json() if files_resp.status_code == 200 else []

            # Review comments are nice-to-have; don't fail the whole call
            comments: List[Dict[str, Any]] = []
            try:
                c_resp = await client.get(
                    f"{base}/comments",
                    headers=_headers(token),
                    params={"per_page": 50},
                )
                if c_resp.status_code == 200:
                    comments = [
                        {
                            "author": (c.get("user") or {}).get("login"),
                            "body": c.get("body", "")[:1200],
                            "path": c.get("path"),
                            "line": c.get("line") or c.get("original_line"),
                            "created_at": c.get("created_at"),
                        }
                        for c in c_resp.json()
                    ]
            except Exception:
                pass

        except Exception as e:
            print(f"[github_api] fetch_pull_request failed: {e}")
            return None

    # Trim patches to the character budget, largest-last so small files survive
    files: List[Dict[str, Any]] = []
    budget = max_patch_chars
    for f in files_raw[:max_files]:
        patch = f.get("patch") or ""
        omitted = False
        if patch and len(patch) > budget:
            patch = ""
            omitted = True
        elif patch:
            budget -= len(patch)

        files.append({
            "filename": f.get("filename"),
            "status": f.get("status"),           # added | modified | removed | renamed
            "additions": f.get("additions", 0),
            "deletions": f.get("deletions", 0),
            "changes": f.get("changes", 0),
            "previous_filename": f.get("previous_filename"),
            "patch": patch,
            "patch_omitted": omitted,
        })

    return {
        "number": pr["number"],
        "title": pr.get("title"),
        "body": (pr.get("body") or "")[:4000],
        "state": pr.get("state"),
        "draft": pr.get("draft", False),
        "merged": pr.get("merged", False),
        "author": (pr.get("user") or {}).get("login"),
        "head": (pr.get("head") or {}).get("ref"),
        "base": (pr.get("base") or {}).get("ref"),
        "additions": pr.get("additions", 0),
        "deletions": pr.get("deletions", 0),
        "changed_files": pr.get("changed_files", 0),
        "created_at": pr.get("created_at"),
        "updated_at": pr.get("updated_at"),
        "url": pr.get("html_url"),
        "files": files,
        "comments": comments,
        "owner": owner,
        "repo": repo,
    }


def build_diff_context(pr: Dict[str, Any], max_chars: int = 18000) -> str:
    """
    Render a PR into a compact text block for the LLM.

    Kept separate from the HTTP layer so it can be unit-tested and reused by
    both the chat route and the dedicated PR review endpoint.
    """
    lines: List[str] = [
        f"PULL REQUEST #{pr['number']}: {pr.get('title') or '(no title)'}",
        f"Author: {pr.get('author')} | {pr.get('head')} -> {pr.get('base')} | "
        f"state={pr.get('state')} additions=+{pr.get('additions')} deletions=-{pr.get('deletions')}",
    ]
    if pr.get("body"):
        lines.append(f"\nDescription:\n{pr['body'][:1200]}")

    lines.append(f"\nCHANGED FILES ({len(pr.get('files', []))}):")
    used = sum(len(x) for x in lines)

    for f in pr.get("files", []):
        header = (
            f"\n--- {f['filename']} [{f['status']}] "
            f"+{f['additions']}/-{f['deletions']}"
        )
        body = "" if f.get("patch_omitted") else (f.get("patch") or "")
        if f.get("patch_omitted"):
            body = "\n(patch omitted — file too large)"
        block = header + "\n" + body
        if used + len(block) > max_chars:
            lines.append("\n(remaining files truncated)")
            break
        lines.append(block)
        used += len(block)

    if pr.get("comments"):
        lines.append("\nREVIEW COMMENTS:")
        for c in pr["comments"][:10]:
            loc = f"{c.get('path')}:{c.get('line')}" if c.get("path") else "general"
            lines.append(f"- [{loc}] {c.get('author')}: {c.get('body', '')[:300]}")

    return "\n".join(lines)
