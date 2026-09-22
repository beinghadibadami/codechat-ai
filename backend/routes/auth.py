"""
GitHub OAuth routes.

Flow:
  1. Frontend opens /auth/github/login → we redirect the browser to GitHub
  2. User authorizes → GitHub redirects to /auth/github/callback?code&state
  3. We exchange the code for a token, store it in session, redirect to frontend
  4. Frontend calls /auth/github/status to see the connected user
  5. /auth/github/logout revokes the token and clears session auth
"""
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse

from config import settings
from services import session_service
from services import github_auth

router = APIRouter(prefix="/auth/github", tags=["auth"])


@router.get("/login")
async def login():
    """Kick off the OAuth flow — redirect to GitHub's authorize page."""
    if not github_auth.is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "GitHub OAuth is not configured on this server. "
                "The admin needs to set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET."
            ),
        )

    state = github_auth.generate_state()
    session_service.register_state(state)
    return RedirectResponse(github_auth.build_authorize_url(state))


@router.get("/callback")
async def callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
):
    """GitHub redirects here after the user authorizes (or denies)."""
    frontend = settings.FRONTEND_URL.rstrip("/")

    def redirect_frontend(**params) -> RedirectResponse:
        qs = urlencode({k: v for k, v in params.items() if v is not None})
        return RedirectResponse(f"{frontend}/?{qs}")

    # User denied on GitHub's side
    if error:
        return redirect_frontend(github_auth="error", reason=error_description or error)

    if not code or not state:
        return redirect_frontend(github_auth="error", reason="missing_code_or_state")

    # CSRF check — state must match one we issued
    if not session_service.consume_state(state):
        return redirect_frontend(github_auth="error", reason="invalid_state")

    token = await github_auth.exchange_code_for_token(code)
    if not token:
        return redirect_frontend(github_auth="error", reason="token_exchange_failed")

    user = await github_auth.fetch_user_login(token)
    session_service.store_github_auth(token, user)

    return redirect_frontend(github_auth="success", user=user or "")


@router.get("/status")
async def status():
    """Return whether the current session has a stored GitHub token."""
    return {
        "configured": github_auth.is_configured(),
        "connected": bool(session_service.get_github_token()),
        "user": session_service.get_github_user(),
    }


@router.post("/logout")
async def logout():
    """Revoke the token with GitHub and clear it from the session."""
    token = session_service.get_github_token()
    revoked = False
    if token:
        revoked = await github_auth.revoke_token(token)
    session_service.clear_github_auth()
    return JSONResponse({"success": True, "revoked": revoked})
