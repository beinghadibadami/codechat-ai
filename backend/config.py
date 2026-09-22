"""
Configuration management for the application
"""
import os
import env_loader  # noqa: F401 — loads .env and .env.local on import


class Settings:
    """Application settings"""

    # API Keys
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
    # Where the backend redirects the browser after a successful callback
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Supabase (used only for shareable sessions — optional feature)
    # Use the service_role key so the backend can read/write without RLS
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

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
        
        # Validate required settings (only in production)
        # Allow empty keys for testing/development
        if not self.GROQ_API_KEY:
            print("[WARN] Warning: GROQ_API environment variable not set")
        if not self.PINECONE_API_KEY:
            print("[WARN] Warning: PINECONE_API_KEY environment variable not set")


# Global settings instance
settings = Settings()
