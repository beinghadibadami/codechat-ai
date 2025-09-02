# embed_store_v2.py - Enhanced version with Pinecone hosted embeddings and reranking

import uuid
import os
import re
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from pinecone import Pinecone, ServerlessSpec
import time

# Load environment variables
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# Initialize Pinecone client
pc = Pinecone(api_key=PINECONE_API_KEY)

class QueryAnalyzer:
    """Analyzes queries to determine optimal retrieval parameters"""
    
    def __init__(self):
        # Define query patterns for different intents
        self.summary_keywords = ['summary', 'summarize', 'overview', 'explain', 'describe', 'what is', 'tell me about']
        self.analysis_keywords = ['analyze', 'analysis', 'architecture', 'pattern', 'structure', 'design', 'flow']
        self.bug_keywords = ['bug', 'error', 'issue', 'problem', 'fix', 'debug', 'vulnerability', 'security','improvements']
        self.specific_keywords = ['function', 'method', 'class', 'variable', 'import', 'specific', 'find']
        
    def analyze_query(self, query: str) -> Dict[str, Any]:
        """Analyze query to determine retrieval strategy"""
        query_lower = query.lower()
        
        # Determine query intent and complexity
        intent = self._classify_intent(query_lower)
        complexity = self._assess_complexity(query_lower)
        specificity = self._assess_specificity(query_lower)
        
        # Dynamic top_k based on intent
        base_k = self._calculate_base_k(intent, complexity)
        
        # Reranking configuration
        should_rerank = intent in ['summary', 'analysis', 'bug_check']
        
        return {
            'intent': intent,
            'complexity': complexity,
            'specificity': specificity,
            'base_k': base_k,
            'should_rerank': should_rerank,
            'rerank_top_n': max(3, base_k // 2) if should_rerank else base_k
        }
    
    def _classify_intent(self, query: str) -> str:
        """Classify the intent of the query"""
        if any(keyword in query for keyword in self.summary_keywords):
            return 'summary'
        elif any(keyword in query for keyword in self.analysis_keywords):
            return 'analysis'
        elif any(keyword in query for keyword in self.bug_keywords):
            return 'bug_check'
        elif any(keyword in query for keyword in self.specific_keywords):
            return 'specific'
        else:
            return 'general'
    
    def _assess_complexity(self, query: str) -> str:
        """Assess query complexity based on length and structure"""
        word_count = len(query.split())
        question_words = len([w for w in query.split() if w in ['what', 'how', 'why', 'when', 'where', 'which']])
        
        if word_count > 15 or question_words > 2:
            return 'high'
        elif word_count > 8 or question_words > 1:
            return 'medium'
        else:
            return 'low'
    
    def _assess_specificity(self, query: str) -> str:
        """Assess how specific the query is"""
        specific_terms = len(re.findall(r'\b[A-Z][a-z]*[A-Z][a-zA-Z]*\b', query))  # CamelCase
        code_patterns = len(re.findall(r'\b\w+\(\)|[\w\.]+\.\w+|\w+\[\]', query))  # function(), obj.method, array[]
        
        if specific_terms > 2 or code_patterns > 1:
            return 'high'
        elif specific_terms > 0 or code_patterns > 0:
            return 'medium'
        else:
            return 'low'
    
    def _calculate_base_k(self, intent: str, complexity: str) -> int:
        """Calculate base top_k based on intent and complexity"""
        base_values = {
            'specific': {'low': 3, 'medium': 5, 'high': 8},
            'general': {'low': 5, 'medium': 8, 'high': 12},
            'summary': {'low': 8, 'medium': 15, 'high': 25},
            'analysis': {'low': 10, 'medium': 18, 'high': 30},
            'bug_check': {'low': 12, 'medium': 20, 'high': 35}
        }
        
        return base_values.get(intent, {'low': 5, 'medium': 8, 'high': 12})[complexity]

class EnhancedPineconeManager:
    """Enhanced Pinecone manager with hosted embeddings and reranking"""
    
    def __init__(self, index_name: str = "ai-code-reviewer"):
        self.index_name = index_name
        self.query_analyzer = QueryAnalyzer()
        self._setup_index()
    
    def _setup_index(self):
        """Setup Pinecone index with hosted embedding model"""
        try:
            if self.index_name not in [idx.name for idx in pc.list_indexes()]:
                # Create index correctly
                index_config = pc.create_index_for_model(
                    name=self.index_name,
                    cloud="aws",
                    region="us-east-1",
                    embed={
                        "model": "multilingual-e5-large",
                        "field_map": {"text": "chunk_text"}
                    },
                    deletion_protection="disabled"
                )
                # CRITICAL: Use the host from index_config
                self.index = pc.Index(host=index_config.host)
            else:
                # For existing index, get the host properly
                self.index = pc.Index(self.index_name)
                
        except Exception as e:
            print(f"Error: {e}")
            raise
    
    def chunk_documents(self, documents: List, chunk_size: int = 800, chunk_overlap: int = 100) -> List:
        """Enhanced chunking with better parameters for code"""
        # Use larger chunks for code to maintain context
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]  # Better for code structure
        )
        return splitter.split_documents(documents)


    def batch_upsert_documents(self, chunks: List, namespace: str, batch_size: int = 50) -> bool:
        """Upsert documents in batches for better performance"""
        if not chunks:
            print("⚠️  No chunks to upsert")
            return False
        
        try:
            # Prepare all records first
            all_records = []
            for i, chunk in enumerate(chunks):
                record = {
                    "_id": f"{namespace}-{uuid.uuid4()}",
                    "chunk_text": chunk.page_content,
                    "file_name": chunk.metadata.get('file_name', 'unknown'),
                    "language": chunk.metadata.get('language', 'unknown'),
                    "chunk_index": i,
                    # "language": chunk.metadata.get('file_type', 'unknown')
                }
                all_records.append(record)
            
            # Upsert in batches
            total_batches = (len(all_records) + batch_size - 1) // batch_size
            
            for batch_num in range(total_batches):
                start_idx = batch_num * batch_size
                end_idx = min(start_idx + batch_size, len(all_records))
                batch_records = all_records[start_idx:end_idx]
                
                self.index.upsert_records(namespace, batch_records)
                print(f"✅ Batch {batch_num + 1}/{total_batches}: Upserted {len(batch_records)} records")
            
            # Wait for final indexing
            import time
            time.sleep(5)  # Reduced wait time since batching is more efficient
            
            print(f"✅ Successfully batch upserted {len(all_records)} total records")
            return True
            
        except Exception as e:
            print(f"❌ Error in batch upsert: {e}")
            return False

    
    def upsert_documents(self, chunks: List, namespace: str, file_path: str = None) -> bool:
        """Upsert documents using Pinecone's hosted embeddings"""
        if not chunks:
            print("⚠️  No chunks to upsert")
            return False
        
        try:
            # Prepare records in the new DocDB-style format
            records = []
            for i, chunk in enumerate(chunks):
                chunk_id = f"{namespace}-{uuid.uuid4()}"
                
                # Enhanced metadata
                metadata = {
                    "file_name": os.path.basename(file_path) if file_path else "unknown",
                    "file_path": file_path if file_path else "unknown",
                    "chunk_index": i,
                    "language": self._get_file_type(file_path)
                }
                
                record = {
                    "id": chunk_id,
                    "chunk_text": chunk.page_content,  # Field that will be embedded
                    **metadata
                }
                records.append(record)
            
            # Upsert with automatic embedding generation
            self.index.upsert_records(
                namespace,
                records
            )
            
            print(f"✅ Upserted {len(records)} records to namespace '{namespace}'")

            # stats = self.index.describe_index_stats()
            # print(f"Index stats: {stats}")

            # time.sleep(2)

            return True
            
        except Exception as e:
            print(f"❌ Error upserting documents: {e}")
            return False
    
    def _get_file_type(self, file_path: str) -> str:
        """Determine file type from extension"""
        if not file_path:
            return "unknown"
        
        ext = os.path.splitext(file_path)[1].lower()
        type_map = {
            '.py': 'python', '.js': 'javascript', '.jsx':'javascript','.ts':'typescript','.tsx':'typescript',
            '.java': 'java', '.cpp': 'cpp', '.c': 'c',
            '.html': 'html', '.css': 'css', '.md': 'markdown',
            '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
            '.ipynb': 'python', '.md': 'markdown',
            '.sql': 'sql', '.csv': 'csv',
            '.go': 'go', '.rs': 'rust', '.php': 'php', '.rb': 'ruby', '.swift': 'swift', '.kt': 'kotlin', '.cs': 'csharp', '.vb': 'vb',
        }
        return type_map.get(ext, 'code')
    
    
    def smart_retrieve(self, query: str, namespace: str, max_tokens: int = 8000) -> List[Dict]:
        """Enhanced retrieval with dynamic top-k, reranking, and token management"""
        try:
            # Analyze query to determine optimal retrieval strategy
            analysis = self.query_analyzer.analyze_query(query)
            
            print(f"🔍 Query Analysis:")
            print(f"   Intent: {analysis['intent']}")
            print(f"   Complexity: {analysis['complexity']}")
            print(f"   Base K: {analysis['base_k']}")
            print(f"   Should Rerank: {analysis['should_rerank']}")
            
            # Initial retrieval with hosted embeddings
            search_params = {
                "namespace": namespace,
                "query": {
                    "inputs": {"text": query},
                    "top_k": analysis['base_k']
                },
                "fields": ["chunk_text", "file_name", "file_path", "language"]
            }
            
            # Add reranking if needed
            if analysis['should_rerank']:
                search_params["rerank"] = {
                    "model": "bge-reranker-v2-m3",  # Pinecone's hosted reranker
                    "top_n": analysis['rerank_top_n'],
                    "rank_fields": ["chunk_text"]
                }
            
            # Perform search
            results = self.index.search(**search_params)
            
              
            if not results or not results.get('result', {}).get('hits'):
                print("⚠️  No results found")
                return []
            
            # Process results and manage token limits
            processed_results = []
            total_tokens = 0
            
            for hit in results['result']['hits']:
                chunk_text = hit['fields']['chunk_text']
                
                # Estimate tokens (rough approximation: 1 token ≈ 4 characters)
                estimated_tokens = len(chunk_text) // 4
                
                if total_tokens + estimated_tokens > max_tokens:
                    print(f"⚠️  Token limit reached. Using {len(processed_results)} chunks.")
                    break
                
                processed_results.append({
                    'text': chunk_text,
                    'file_name': hit['fields'].get('file_name', 'unknown'),
                    'file_path': hit['fields'].get('file_path', 'unknown'),
                    'language': hit['fields'].get('language', 'unknown'),
                    'score': hit.get('_score', 0),
                    'reranked': analysis['should_rerank']
                })
                
                total_tokens += estimated_tokens
            
            print(f"✅ Retrieved {len(processed_results)} chunks (~{total_tokens} tokens)")
            return processed_results
            
        except Exception as e:
            print(f"❌ Error in smart retrieval: {e}")
            return []

# Factory function to create the enhanced manager
def create_enhanced_pinecone_manager(index_name: str = "ai-code-reviewer") -> EnhancedPineconeManager:
    """Factory function to create enhanced Pinecone manager"""
    return EnhancedPineconeManager(index_name)
