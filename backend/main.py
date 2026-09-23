"""
CodeChat AI - Main FastAPI Application

A modular, maintainable backend for AI-powered code analysis
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import settings
from routes import session, upload, chat, files, auth, architecture, share, pulls

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description="AI-powered code analysis using RAG and LLM"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(session.router)
app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(files.router)
app.include_router(auth.router)
app.include_router(architecture.router)
app.include_router(share.router)
app.include_router(pulls.router)


@app.get("/")
def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "message": "RAG Code Reviewer is running",
        "version": settings.APP_VERSION,
        "features": [
            "hosted_embeddings",
            "reranking",
            "dynamic_topk",
            "token_management",
            "enhanced_chunking"
        ]
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
