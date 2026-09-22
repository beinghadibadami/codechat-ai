"""
Singleton wrapper around the Pinecone manager.

Before this, each route module created its own EnhancedPineconeManager at
import time — which meant three separate Pinecone connections + three
list_indexes() network calls on startup. Now every route calls
`get_pinecone_manager()` and shares one instance.

Lazy init: the manager is not built until first access. This keeps import
time fast and lets tests / CI import the app without hitting Pinecone.
"""
from typing import Optional
from embed_store_v2 import EnhancedPineconeManager, create_enhanced_pinecone_manager

_manager: Optional[EnhancedPineconeManager] = None


def get_pinecone_manager() -> EnhancedPineconeManager:
    """Return the shared Pinecone manager, creating it on first call."""
    global _manager
    if _manager is None:
        _manager = create_enhanced_pinecone_manager()
    return _manager


def reset_pinecone_manager():
    """Force re-init on next access. Useful in tests."""
    global _manager
    _manager = None
