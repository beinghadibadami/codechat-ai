"""
Pydantic models for request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List


class ChatMessage(BaseModel):
    """A single message in the conversation history"""
    role: str = Field(..., description="Either 'user' or 'assistant'")
    content: str = Field(..., min_length=1, max_length=8000)


class QueryRequest(BaseModel):
    """Request model for chat queries"""
    message: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="User's question — bounded to 2000 chars to prevent injection walls of text"
    )
    history: Optional[List[ChatMessage]] = Field(
        default=None,
        max_length=20,
        description="Recent conversation turns for context (older-first order)"
    )
    max_tokens: Optional[int] = Field(
        None,  # None = let retrieval decide from query intent
        ge=1000, le=32000,
        description="Optional retrieval token budget override"
    )


class ConfigRequest(BaseModel):
    """Request model for chunking configuration"""
    chunk_size: Optional[int] = Field(800, ge=200, le=2000, description="Size of text chunks")
    chunk_overlap: Optional[int] = Field(100, ge=0, le=500, description="Overlap between chunks")


class FileExplainRequest(BaseModel):
    """Request model for file explanation"""
    file_path: str = Field(..., min_length=1, description="Path to the file to explain")


class GitHubUploadRequest(BaseModel):
    """Request model for GitHub repository upload"""
    repo_url: str = Field(..., min_length=1, description="GitHub repository URL")
    chunk_size: Optional[int] = Field(800, ge=200, le=2000)
    chunk_overlap: Optional[int] = Field(100, ge=0, le=500)


class HealthResponse(BaseModel):
    """Response model for health check"""
    status: str
    message: str
    features: List[str]


class SessionInfoResponse(BaseModel):
    """Response model for session information"""
    namespace: str
    has_data: bool
    files_processed: int
    features: Dict[str, bool]


class UploadResponse(BaseModel):
    """Response model for file uploads"""
    success: bool
    message: str
    namespace: str
    config: Optional[Dict[str, int]] = None


class ChatMetadata(BaseModel):
    """Metadata for chat responses"""
    chunks_found: int
    files_involved: Optional[int] = None
    file_summary: Optional[Dict] = None
    retrieval_reranked: Optional[bool] = None


class ChatResponse(BaseModel):
    """Response model for chat queries"""
    success: bool
    response: str
    metadata: ChatMetadata


class FileTreeNode(BaseModel):
    """Node in the file tree structure"""
    name: str
    path: str
    type: str  # "file" or "folder"
    children: Optional[List['FileTreeNode']] = None


class FileTreeResponse(BaseModel):
    """Response model for file tree"""
    success: bool
    tree: List[FileTreeNode]
    root_path: Optional[str] = None
    total_files: Optional[int] = None
    files_processed: Optional[int] = None
    message: Optional[str] = None


# Enable forward references for recursive models
FileTreeNode.model_rebuild()
