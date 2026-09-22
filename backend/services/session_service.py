"""
Session management service.

This is a single-process in-memory session store. It works for a single-user
demo (the entire app has one `current_session`). Migrate to per-user sessions
with Redis / signed cookies before going multi-tenant.
"""
import uuid
import os
import shutil
import time
from typing import Dict, Optional


class SessionService:
    """Manages the current user session and its GitHub auth state."""

    # State tokens issued during OAuth expire after this many seconds
    STATE_TTL_SECONDS = 600  # 10 minutes

    def __init__(self):
        self.current_session = self.generate_new_session()
        # OAuth CSRF state tokens: state → issued_at
        self._pending_states: Dict[str, float] = {}

    # ------- Session -----------------------------------------------------

    def generate_new_session(self) -> Dict:
        """Generate a new session with unique namespace and empty auth."""
        return {
            "namespace": str(uuid.uuid4()),
            "path": None,
            "files_processed": 0,
            "github_token": None,
            "github_user": None,
        }

    def get_session(self) -> Dict:
        return self.current_session

    def update_session(
        self,
        path: Optional[str] = None,
        files_processed: Optional[int] = None,
    ):
        if path is not None:
            self.current_session["path"] = path
        if files_processed is not None:
            self.current_session["files_processed"] = files_processed

    def reset_session(self) -> Dict:
        """
        Reset the session's uploaded code, but *keep* GitHub auth.
        Users who connected GitHub don't want to re-auth after every upload.
        Use clear_github_auth() explicitly to log out.
        """
        # Preserve auth
        github_token = self.current_session.get("github_token")
        github_user = self.current_session.get("github_user")

        # Cleanup old session path
        if self.current_session["path"] and os.path.exists(self.current_session["path"]):
            try:
                shutil.rmtree(self.current_session["path"], ignore_errors=True)
            except Exception as e:
                print(f"Warning: Failed to cleanup old session: {e}")

        self.current_session = self.generate_new_session()
        self.current_session["github_token"] = github_token
        self.current_session["github_user"] = github_user
        return self.current_session

    def has_data(self) -> bool:
        return (
            self.current_session["path"] is not None
            and os.path.exists(self.current_session["path"])
            and self.current_session.get("files_processed", 0) > 0
        )

    # ------- GitHub auth -------------------------------------------------

    def store_github_auth(self, token: str, user: Optional[str]):
        """Attach a GitHub access token + user handle to the current session."""
        self.current_session["github_token"] = token
        self.current_session["github_user"] = user

    def get_github_token(self) -> Optional[str]:
        return self.current_session.get("github_token")

    def get_github_user(self) -> Optional[str]:
        return self.current_session.get("github_user")

    def clear_github_auth(self):
        self.current_session["github_token"] = None
        self.current_session["github_user"] = None

    # ------- OAuth CSRF state --------------------------------------------

    def _prune_expired_states(self):
        cutoff = time.time() - self.STATE_TTL_SECONDS
        self._pending_states = {
            s: t for s, t in self._pending_states.items() if t > cutoff
        }

    def register_state(self, state: str):
        """Remember a state token we generated for an OAuth /login."""
        self._prune_expired_states()
        self._pending_states[state] = time.time()

    def consume_state(self, state: str) -> bool:
        """Return True if the state is valid and unused; remove it either way."""
        self._prune_expired_states()
        return self._pending_states.pop(state, None) is not None


# Global session service instance
session_service = SessionService()
