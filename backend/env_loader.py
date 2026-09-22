"""
Centralized .env loader with Next.js-style precedence:

    .env         → base values (checked into version control? no — but committed
                    to the deployment env as production values)
    .env.local   → local overrides (should be .gitignore'd)

Values in .env.local take precedence over .env for the same key.
Both are optional — missing files are silently skipped.

Also walks up from the caller's cwd, so it works from either the backend/
directory or the repo root.
"""
from dotenv import load_dotenv, find_dotenv


def load_env():
    """Load .env then .env.local (override=True) if either exists."""
    base = find_dotenv(".env", usecwd=True)
    if base:
        load_dotenv(base)

    local = find_dotenv(".env.local", usecwd=True)
    if local:
        load_dotenv(local, override=True)


# Auto-run on import so any module can just `import env_loader` at the top
load_env()
