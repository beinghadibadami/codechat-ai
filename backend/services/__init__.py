"""Services package for business logic"""
from .session_service import session_service, SessionService
from .file_service import (
    build_file_tree,
    find_file_in_repo,
    read_file_with_limit,
    count_files_in_tree,
)
from .llm_service import (
    build_chat_context,
    build_file_explain_prompt,
    query_llm,
    compress_history,
)
from .pinecone_service import get_pinecone_manager, reset_pinecone_manager

__all__ = [
    'session_service',
    'SessionService',
    'build_file_tree',
    'find_file_in_repo',
    'read_file_with_limit',
    'count_files_in_tree',
    'build_chat_context',
    'build_file_explain_prompt',
    'query_llm',
    'compress_history',
    'get_pinecone_manager',
    'reset_pinecone_manager',
]
