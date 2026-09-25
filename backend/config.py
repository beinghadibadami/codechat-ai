"""
Configuration management for the application
"""
import os
import env_loader  # noqa: F401 — loads .env and .env.local on import


class Settings:
    """Application settings"""

    # API Keys.
    # GROQ_API_KEYS (comma-separated pool) is preferred; GROQ_API is the
    # legacy single-key form and still works.
    GROQ_API_KEYS: str = os.getenv("GROQ_API_KEYS", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API", "")
    PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY", "")

    # Data storage
    DATA_DIR: str = os.getenv("DATA_DIR", "/tmp/rag-data")

    # GitHub OAuth
    # Register an OAuth App at https://github.com/settings/developers
    # Set the Authorization callback URL to `<BACKEND_URL>/auth/github/callback`
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")
    # Where GitHub sends the user back to (must match the OAuth App setting)
    GITHUB_REDIRECT_URI: str = os.getenv(
        "GITHUB_REDIRECT_URI",
        "http://localhost:8000/auth/github/callback"
    )
    # Where the backend redirects the browser after a successful callback.
    # Defaults to 8080 because that is the port this project's Vite config uses.
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:8080")

    # Supabase (shareable sessions + repo cache — optional features)
    # Use the service_role key so the backend can read/write without RLS
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # Repo cache: how long a repo's Pinecone namespace is kept for reuse.
    # A re-picked repo within this window skips embedding (files re-clone).
    REPO_CACHE_TTL_DAYS: int = int(os.getenv("REPO_CACHE_TTL_DAYS", "7"))

    # CORS settings — must include the deployed frontend origin
    CORS_ORIGINS: list = [
        "http://localhost:8080",
        "http://localhost:5173",
        "https://codechat-jgxg.onrender.com",
    ]
    
    # Application settings
    APP_TITLE: str = "Codechat AI"
    APP_VERSION: str = "2.0.0"
    
    # Pinecone settings
    PINECONE_INDEX_NAME: str = "ai-code-reviewer"
    PINECONE_CLOUD: str = "aws"
    PINECONE_REGION: str = "us-east-1"
    
    # LLM settings
    LLM_MODEL: str = "openai/gpt-oss-120b"
    LLM_TEMPERATURE: float = 0.7
    LLM_TOP_P: float = 0.9
    
    # Chunking defaults
    DEFAULT_CHUNK_SIZE: int = 800
    DEFAULT_CHUNK_OVERLAP: int = 100
    
    # Retrieval defaults
    DEFAULT_MAX_TOKENS: int = 8000
    
    def __init__(self):
        """Initialize settings and create necessary directories"""
        os.makedirs(self.DATA_DIR, exist_ok=True)
        
        # Warn rather than raise so tests and local tooling can import the app
        # without a full credential set.
        if not (self.GROQ_API_KEYS or self.GROQ_API_KEY):
            print("[WARN] No Groq key configured — set GROQ_API_KEYS or GROQ_API")
        if not self.PINECONE_API_KEY:
            print("[WARN] PINECONE_API_KEY not set")


# Global settings instance
settings = Settings()
