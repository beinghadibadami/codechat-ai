"""
GitHub OAuth (Web Application flow) helpers.

We use the standard OAuth 2.0 authorization code flow:
  1. /auth/github/login → redirect user to github.com/login/oauth/authorize
  2. GitHub redirects back to /auth/github/callback?code=…&state=…
  3. Exchange code for access token
  4. Store token in server-side session against the pending state

Security notes:
- `state` is a random UUID we generate before the redirect. GitHub echoes it
  back on the callback. We verify it matches before trusting the code — this
  prevents CSRF on the callback.
- The access token is stored server-side only. It is never sent to the
  browser. The frontend only knows if the connection succeeded.
"""
import secrets
from urllib.parse import urlencode
from typing import Optional

import httpx

from config import settings


GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_REVOKE_URL = "https://api.github.com/applications/{client_id}/token"

# Scopes:
#   `repo` grants read/write on public + private repos. We only need read.
#   `read:user` gives us the login handle for showing "Connected as @user".
# GitHub OAuth Apps don't offer read-only repo scope — use "repo" and only
# call read operations. For finer-grained control, migrate to a GitHub App.
DEFAULT_SCOPES = "repo read:user"


def is_configured() -> bool:
    """OAuth is only available if both client id + secret are set."""
    return bool(settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET)


def generate_state() -> str:
    """Generate a cryptographically-random state token for CSRF protection."""
    return secrets.token_urlsafe(32)


def build_authorize_url(state: str, scopes: str = DEFAULT_SCOPES) -> str:
    """Build the URL to redirect the user to on GitHub."""
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": scopes,
        "state": state,
        "allow_signup": "true",
    }
    return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> Optional[str]:
    """
    POST the code back to GitHub to get an access token.
    Returns the token string, or None on failure.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                GITHUB_TOKEN_URL,
                data={
                    "client_id": settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": settings.GITHUB_REDIRECT_URI,
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                print(f"[github_auth] token exchange failed: {resp.status_code} {resp.text[:200]}")
                return None
            data = resp.json()
            if "error" in data:
                print(f"[github_auth] GitHub error: {data.get('error_description') or data.get('error')}")
                return None
            return data.get("access_token")
        except Exception as e:
            print(f"[github_auth] token exchange exception: {e}")
            return None


async def fetch_user_login(token: str) -> Optional[str]:
    """Fetch the authenticated user's login (handle). Returns None on failure."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                GITHUB_USER_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            if resp.status_code != 200:
                return None
            return resp.json().get("login")
        except Exception:
            return None


async def revoke_token(token: str) -> bool:
    """
    Ask GitHub to revoke the token (best-effort).
    Uses Basic auth with client_id:client_secret.
    """
    if not is_configured() or not token:
        return False
    url = GITHUB_REVOKE_URL.format(client_id=settings.GITHUB_CLIENT_ID)
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.request(
                "DELETE",
                url,
                auth=(settings.GITHUB_CLIENT_ID, settings.GITHUB_CLIENT_SECRET),
                json={"access_token": token},
                headers={"Accept": "application/vnd.github+json"},
            )
            # 204 = success. Anything else, still consider best-effort done.
            return resp.status_code == 204
        except Exception:
            return False
