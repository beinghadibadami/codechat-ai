# embed_store_v2.py - Enhanced version with Pinecone hosted embeddings and reranking

import uuid
import os
import re
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pinecone import Pinecone, ServerlessSpec
import time

import env_loader  # noqa: F401 — loads .env and .env.local on import

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# Initialize Pinecone client
pc = Pinecone(api_key=PINECONE_API_KEY)


def _as_line_no(value) -> Optional[int]:
    """
    Normalise a line number coming back from Pinecone.

    Pinecone's metadata store keeps numbers as doubles, so a stored `20` is
    returned as `20.0`. Formatted into a citation that becomes "file.py:20.0",
    which the frontend citation parser rejects — so every citation silently
    degraded to plain text. Coerce back to int and drop anything unusable.
    """
    if value is None:
        return None
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None

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

    def delete_namespace(self, namespace: str) -> bool:
        """
        Delete every vector in a namespace.

        Used for session cleanup (disconnect / reset) and to guarantee a clean
        slate before re-indexing, so a new codebase never mixes with the
        previous one's vectors. Deleting an empty/absent namespace is treated
        as success — it's idempotent by design.
        """
        if not namespace:
            return False
        try:
            self.index.delete(delete_all=True, namespace=namespace)
            print(f"[OK] Cleared namespace '{namespace}'")
            return True
        except Exception as e:
            msg = str(e).lower()
            # Pinecone raises 404 when the namespace has no vectors yet.
            if "not found" in msg or "404" in msg:
                print(f"[WARN] Namespace '{namespace}' already empty")
                return True
            print(f"[ERROR] Failed to clear namespace '{namespace}': {e}")
            return False

    # File-size thresholds for chunking strategy (in characters)
    SMALL_FILE_THRESHOLD = 1500      # Files smaller than this are kept whole
    CONFIG_FILE_THRESHOLD = 3000     # Config-like files can be bigger before splitting

    def chunk_documents(self, documents: List, chunk_size: int = 800, chunk_overlap: int = 100) -> List:
        """
        Adaptive chunking strategy:
        - Small files (< 1500 chars) → single chunk, preserves full context
        - Config/markdown files → larger chunks (fewer boundaries)
        - Code files → 800-char chunks with class/function scope prepended
        - All chunks get rich metadata for filtering and hybrid search
        """
        all_chunks = []

        for doc in documents:
            file_path = doc.metadata.get('source', '')
            text = doc.page_content
            char_count = len(text)
            language = self._get_file_type(file_path)

            # Route to appropriate chunking strategy
            if char_count <= self.SMALL_FILE_THRESHOLD:
                # Small file → keep as single chunk
                chunks = [doc]
            elif language in ('json', 'yaml', 'markdown') and char_count <= self.CONFIG_FILE_THRESHOLD:
                # Config-ish files → single chunk unless very large
                chunks = [doc]
            elif language in ('json', 'yaml'):
                # Large config files → bigger chunks (fewer splits)
                chunks = self._split_with_size(doc, chunk_size=1500, chunk_overlap=150)
            elif language == 'markdown':
                # Markdown → split on headers where possible
                chunks = self._split_with_size(doc, chunk_size=1200, chunk_overlap=150)
            else:
                # Code files → standard split, then add scope context
                chunks = self._split_with_size(doc, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
                chunks = self._add_scope_context(chunks, full_text=text, language=language)

            # Attach line numbers to each chunk before enrichment
            self._attach_line_numbers(chunks, full_text=text)

            # Enrich metadata for every chunk regardless of strategy
            for chunk in chunks:
                # Ensure file identity is present before any upsert
                chunk.metadata.setdefault('file_path', file_path)
                chunk.metadata.setdefault('file_name', os.path.basename(file_path) if file_path else 'unknown')
                chunk.metadata.setdefault('language', language)
                self._enrich_chunk_metadata(chunk, language=language)

            all_chunks.extend(chunks)

        return all_chunks

    def _attach_line_numbers(self, chunks: List, full_text: str):
        """
        Set chunk.metadata['line_start'] and ['line_end'] by locating each
        chunk within the original file text.

        Approximate — for very repetitive files where the same short prefix
        appears multiple times, the wrong occurrence might be picked. Good
        enough for citation purposes.
        """
        if not chunks:
            return

        # Single chunk = whole file
        if len(chunks) == 1:
            chunks[0].metadata['line_start'] = 1
            chunks[0].metadata['line_end'] = full_text.count('\n') + 1
            return

        cursor = 0
        for chunk in chunks:
            text = chunk.page_content
            # Anchor on a distinctive prefix (first ~120 chars, stripped)
            anchor = text[:120].strip()
            if not anchor:
                # Empty chunk — skip
                chunk.metadata['line_start'] = 1
                chunk.metadata['line_end'] = 1
                continue

            pos = full_text.find(anchor, cursor)
            if pos == -1:
                # Fall back to unanchored search
                pos = full_text.find(anchor)
                if pos == -1:
                    chunk.metadata['line_start'] = 1
                    chunk.metadata['line_end'] = 1
                    continue

            line_start = full_text.count('\n', 0, pos) + 1
            line_end = line_start + text.count('\n')
            chunk.metadata['line_start'] = line_start
            chunk.metadata['line_end'] = line_end
            cursor = pos + len(anchor)

    def _split_with_size(self, doc, chunk_size: int, chunk_overlap: int) -> List:
        """Run the recursive splitter on a single Document with given parameters."""
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )
        return splitter.split_documents([doc])

    def _add_scope_context(self, chunks: List, full_text: str, language: str) -> List:
        """
        For each chunk, detect the enclosing class or top-level function and
        prepend a short context comment. This gives orphan chunks (e.g., a
        method body split away from its class header) the scope they need.

        Only Python and JS/TS families supported — regex-based, best-effort.
        """
        if not chunks or len(chunks) <= 1:
            return chunks  # Single chunk already has its own header

        # Build a map of char-offset → enclosing scope for the full file
        scope_map = self._build_scope_map(full_text, language)
        if not scope_map:
            return chunks

        # For each chunk (except the first, which has natural context),
        # find its position in the original text and prepend the scope
        cursor = 0
        for i, chunk in enumerate(chunks):
            # Locate this chunk in the original text (search forward from cursor)
            chunk_text = chunk.page_content
            snippet = chunk_text[:80].strip()  # Use first line-ish as anchor
            pos = full_text.find(snippet, cursor) if snippet else -1
            if pos == -1:
                continue
            cursor = pos + len(snippet)

            # Find the closest scope that starts before this chunk
            enclosing = self._find_enclosing_scope(scope_map, pos)
            if not enclosing:
                continue

            # If the chunk already contains the class/def line, skip
            if enclosing['header'].strip() in chunk_text:
                continue

            # Prepend a short context comment
            comment_prefix = '#' if language == 'python' else '//'
            context_line = f"{comment_prefix} Context: {enclosing['header'].strip()}\n"
            chunk.page_content = context_line + chunk_text
            chunk.metadata['scope_context'] = enclosing['header'].strip()

        return chunks

    def _build_scope_map(self, text: str, language: str):
        """
        Return a list of {start_offset, header, kind} for each class/function
        definition in the file, in document order.
        """
        scopes = []
        if language == 'python':
            # Match `class Foo:` or `def bar(...):` at any indent
            for m in re.finditer(r'^([ \t]*)(class\s+\w+[^\n]*|def\s+\w+\([^)]*\)[^\n]*):?', text, re.MULTILINE):
                scopes.append({
                    'start': m.start(),
                    'header': m.group(0),
                    'kind': 'class' if 'class' in m.group(2) else 'def'
                })
        elif language in ('javascript', 'typescript'):
            # Match `class Foo`, `function bar(`, `const Foo = (...) =>`, `export const Foo`
            patterns = [
                r'^[ \t]*(?:export\s+)?class\s+\w+[^\n]*',
                r'^[ \t]*(?:export\s+)?(?:async\s+)?function\s+\w+[^\n]*',
                r'^[ \t]*(?:export\s+)?const\s+[A-Za-z_$]\w*\s*(?::\s*\S+)?\s*=\s*(?:async\s*)?\([^)]*\)\s*=>',
            ]
            for pat in patterns:
                for m in re.finditer(pat, text, re.MULTILINE):
                    scopes.append({'start': m.start(), 'header': m.group(0), 'kind': 'code'})
            scopes.sort(key=lambda s: s['start'])
        return scopes

    def _find_enclosing_scope(self, scope_map, chunk_offset: int):
        """Return the last scope whose start is before chunk_offset."""
        enclosing = None
        for scope in scope_map:
            if scope['start'] < chunk_offset:
                enclosing = scope
            else:
                break
        return enclosing

    def _enrich_chunk_metadata(self, chunk, language: str):
        """Attach code-structure metadata used for filtering and hybrid search."""
        text = chunk.page_content

        python_funcs = re.findall(r'^\s*def\s+(\w+)', text, re.MULTILINE)
        python_classes = re.findall(r'^\s*class\s+(\w+)', text, re.MULTILINE)
        js_funcs = re.findall(
            r'(?:function\s+(\w+)|const\s+(\w+)\s*=.*?(?:=>|\{)|export\s+(?:async\s+)?function\s+(\w+))',
            text
        )
        js_func_names = [f for group in js_funcs for f in group if f]
        react_components = re.findall(
            r'(?:export\s+)?(?:const|function)\s+([A-Z]\w+).*?(?:React\.FC|:\s*FC|=>)',
            text
        )
        has_imports = bool(re.search(r'^\s*(?:import|from)\s+', text, re.MULTILINE))
        chunk_type = self._classify_chunk_type(text)

        # All symbol names (used for hybrid keyword filter)
        all_symbols = list(set(python_funcs + python_classes + js_func_names + react_components))

        chunk.metadata.update({
            'functions': python_funcs + js_func_names,
            'classes': python_classes,
            'components': react_components,
            'symbols': all_symbols,
            'has_imports': has_imports,
            'chunk_type': chunk_type,
            'char_count': len(text),
            'line_count': text.count('\n') + 1,
        })
    
    # Quoted string literals, excluding trivially short ones
    _STRING_LITERAL_RE = re.compile(r'"[^"\n]{3,}"|\'[^\'\n]{3,}\'|`[^`\n]{3,}`')
    _LOGIC_TOKEN_RE = re.compile(
        r'\b(?:if|else|for|while|switch|return|await|async|try|catch|throw|'
        r'function|def|class|import|require)\b'
    )

    def _looks_like_content_data(self, text: str) -> bool:
        """
        True when a chunk is mostly *data about things* rather than logic.

        Motivating failure: a portfolio site had an `AllProjects` array listing
        other projects and their stacks ("MongoDB", "Shopify", "Razorpay").
        Asked what the portfolio was built with, the model read those strings
        and reported them as the site's own dependencies. Flagging such chunks
        lets the prompt tell the model the difference between what an app
        *displays* and what it *uses*.
        """
        if len(text) < 120:
            return False

        strings = self._STRING_LITERAL_RE.findall(text)
        if len(strings) < 6:
            return False

        string_chars = sum(len(s) for s in strings)
        density = string_chars / max(len(text), 1)
        logic_tokens = len(self._LOGIC_TOKEN_RE.findall(text))

        # Dense in literals and thin on control flow → it's a data table.
        return density > 0.32 and logic_tokens <= 3

    def _classify_chunk_type(self, text: str) -> str:
        """Classify what type of code this chunk contains"""
        # Checked first: a data array can still contain arrow functions or
        # look superficially like a definition.
        if self._looks_like_content_data(text):
            return 'content_data'

        # Check for different code patterns
        if re.search(r'^\s*class\s+\w+', text, re.MULTILINE):
            return 'class_definition'
        elif re.search(r'^\s*(?:def|function|const\s+\w+\s*=.*?=>)\s+', text, re.MULTILINE):
            return 'function_definition'
        elif re.search(r'^\s*(?:import|from)\s+', text, re.MULTILINE) and text.count('\n') < 10:
            return 'imports'
        elif text.strip().startswith('{') or text.strip().startswith('['):
            return 'config_data'
        elif '@app.' in text or '@router.' in text:
            return 'api_route'
        elif 'interface ' in text or 'type ' in text:
            return 'type_definition'
        else:
            return 'general_code'


    def batch_upsert_documents(
        self,
        chunks: List,
        namespace: str,
        batch_size: int = 50,
        max_workers: int = 5,
        on_progress=None,
    ) -> bool:
        """
        Upsert documents to Pinecone in batches, several batches in flight at
        once.

        Concurrency is the main lever on indexing wall-clock time: each batch is
        a network round-trip to Pinecone's hosted-embedding endpoint, so firing
        `max_workers` of them together instead of one-at-a-time cuts the wait
        roughly proportionally. Workers are bounded to stay under rate limits.

        `on_progress(done, total)` — if given — is called as batches complete so
        callers can surface real progress.
        """
        if not chunks:
            print("[WARN] No chunks to upsert")
            return False

        try:
            # Prepare all records first — include full metadata so retrieval
            # filters (file_name, symbols) work at query time.
            all_records = []
            for i, chunk in enumerate(chunks):
                md = chunk.metadata or {}
                record = {
                    "_id": f"{namespace}-{uuid.uuid4()}",
                    "chunk_text": chunk.page_content,
                    "file_name": md.get('file_name', 'unknown'),
                    "file_path": md.get('file_path', 'unknown'),
                    "language": md.get('language', 'unknown'),
                    "chunk_index": i,
                    "chunk_type": md.get('chunk_type', 'general_code'),
                    "symbols": md.get('symbols', []),
                    "functions": md.get('functions', []),
                    "classes": md.get('classes', []),
                    "line_start": md.get('line_start', 1),
                    "line_end": md.get('line_end', 1),
                }
                all_records.append(record)

            # Split into batches
            batches = [
                all_records[i:i + batch_size]
                for i in range(0, len(all_records), batch_size)
            ]
            total = len(all_records)
            done = 0

            # Fire batches concurrently, bounded by max_workers.
            with ThreadPoolExecutor(max_workers=min(max_workers, len(batches))) as pool:
                futures = {
                    pool.submit(self.index.upsert_records, namespace, batch): len(batch)
                    for batch in batches
                }
                for future in as_completed(futures):
                    count = futures[future]
                    # Surface the failure rather than silently dropping a batch.
                    future.result()
                    done += count
                    if on_progress:
                        try:
                            on_progress(done, total)
                        except Exception:
                            pass  # progress reporting must never break the upsert
                    print(f"[OK] Upserted {done}/{total} records")

            # Give Pinecone a moment to make the last writes queryable.
            time.sleep(3)

            print(f"[OK] Successfully batch upserted {total} total records")
            return True

        except Exception as e:
            print(f"[ERROR] batch upsert failed: {e}")
            return False

    
    def upsert_documents(self, chunks: List, namespace: str, file_path: str = None) -> bool:
        """Upsert documents using Pinecone's hosted embeddings"""
        if not chunks:
            print("[WARN] No chunks to upsert")
            return False
        
        try:
            # Prepare records in the new DocDB-style format — merge caller
            # info with the metadata added during chunking (symbols, chunk_type…)
            records = []
            for i, chunk in enumerate(chunks):
                chunk_id = f"{namespace}-{uuid.uuid4()}"
                md = chunk.metadata or {}
                metadata = {
                    "file_name": os.path.basename(file_path) if file_path else md.get('file_name', 'unknown'),
                    "file_path": file_path if file_path else md.get('file_path', 'unknown'),
                    "chunk_index": i,
                    "language": self._get_file_type(file_path) if file_path else md.get('language', 'unknown'),
                    "chunk_type": md.get('chunk_type', 'general_code'),
                    "symbols": md.get('symbols', []),
                    "functions": md.get('functions', []),
                    "classes": md.get('classes', []),
                    "line_start": md.get('line_start', 1),
                    "line_end": md.get('line_end', 1),
                }
                record = {
                    "id": chunk_id,
                    "chunk_text": chunk.page_content,
                    **metadata,
                }
                records.append(record)
            
            # Upsert with automatic embedding generation
            self.index.upsert_records(
                namespace,
                records
            )
            
            print(f"[OK] Upserted {len(records)} records to namespace '{namespace}'")

            # stats = self.index.describe_index_stats()
            # print(f"Index stats: {stats}")

            # time.sleep(2)

            return True
            
        except Exception as e:
            print(f"[ERROR] upserting documents failed: {e}")
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
    
    
    # Query-type aware token budgets. gpt-oss-120b has a 131K context window,
    # so we can afford to be generous for complex queries and still leave
    # plenty of headroom for the response.
    TOKEN_BUDGETS = {
        'specific': 4000,    # Focused questions — small context is fine
        'general': 8000,     # Default
        'summary': 20000,    # Summaries need broad context
        'analysis': 24000,   # Analysis benefits from lots of context
        'bug_check': 16000,  # Bug hunting needs multiple files
    }

    # Common file extensions we look for in queries (for file-level filter)
    FILE_EXT_PATTERN = re.compile(
        r'\b([\w.-]+\.(?:py|js|ts|tsx|jsx|java|cpp|c|go|rs|php|rb|swift|kt|cs|vb|html|css|json|yaml|yml|md|sql))\b',
        re.IGNORECASE
    )

    def _extract_file_hint(self, query: str):
        """Return a filename mentioned in the query, or None."""
        m = self.FILE_EXT_PATTERN.search(query)
        return m.group(1) if m else None

    def _extract_symbol_hints(self, query: str) -> List[str]:
        """
        Pull out likely code identifiers from the query for hybrid keyword
        filtering:
          - PascalCase (UserService, ChatInterface)
          - camelCase (getUserById, myFunction)
          - snake_case with underscore (get_user_by_id)
          - foo() or obj.method() call patterns
        Common English words filtered out.
        """
        # PascalCase: starts uppercase, has another uppercase-lower group
        pascal = re.findall(r'\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b', query)
        # camelCase: starts lowercase, has an internal uppercase-lower group
        camel = re.findall(r'\b[a-z]+(?:[A-Z][a-z]*)+\b', query)
        # snake_case with underscore
        snake = re.findall(r'\b[a-z]+_[a-z_]+\b', query)
        # foo() or obj.method()
        calls = re.findall(r'\b([A-Za-z_]\w+)\s*\(', query)

        symbols = set(pascal + camel + snake + calls)
        stop = {
            'function', 'class', 'method', 'return', 'import',
            'export', 'const', 'variable',
        }
        return [s for s in symbols if s.lower() not in stop and len(s) > 2]

    def smart_retrieve(self, query: str, namespace: str, max_tokens: int = None) -> List[Dict]:
        """
        Multi-signal retrieval:
          1. Query analysis → intent, complexity, top-k
          2. File-level filter if query mentions a filename
          3. Hybrid symbol filter as a first-pass narrowing (with fallback)
          4. Vector search + optional reranking
          5. Query-type aware token budget (not the hard 8K default)
        """
        try:
            analysis = self.query_analyzer.analyze_query(query)
            file_hint = self._extract_file_hint(query)
            symbol_hints = self._extract_symbol_hints(query)

            # Use query-type budget unless caller specifies
            if max_tokens is None:
                max_tokens = self.TOKEN_BUDGETS.get(analysis['intent'], 8000)

            print(f"[SEARCH] Query Analysis:")
            print(f"   Intent: {analysis['intent']}")
            print(f"   Complexity: {analysis['complexity']}")
            print(f"   Base K: {analysis['base_k']}")
            print(f"   Rerank: {analysis['should_rerank']}")
            print(f"   Token budget: {max_tokens}")
            print(f"   File hint: {file_hint}")
            print(f"   Symbol hints: {symbol_hints}")

            # Build metadata filter (Pinecone $and / $eq / $in)
            metadata_filter = self._build_metadata_filter(file_hint, symbol_hints)

            # Attempt 1: search with the filter (if any)
            results = self._pinecone_search(query, namespace, analysis, metadata_filter)

            # Attempt 2: if filtered search returned nothing, fall back without filter
            # (e.g., query mentions a filename that isn't in the index)
            if metadata_filter and not results.get('result', {}).get('hits'):
                print("[WARN] Filtered search empty — retrying without filter")
                results = self._pinecone_search(query, namespace, analysis, filter_=None)

            hits = results.get('result', {}).get('hits', []) if results else []
            if not hits:
                print("[WARN] No results found")
                return []

            # Assemble results with token budget enforcement
            processed_results = []
            total_tokens = 0
            for hit in hits:
                chunk_text = hit['fields']['chunk_text']
                estimated_tokens = len(chunk_text) // 4  # rough approximation
                if total_tokens + estimated_tokens > max_tokens:
                    print(f"[WARN] Token budget reached at {len(processed_results)} chunks")
                    break

                processed_results.append({
                    'text': chunk_text,
                    'file_name': hit['fields'].get('file_name', 'unknown'),
                    'file_path': hit['fields'].get('file_path', 'unknown'),
                    'language': hit['fields'].get('language', 'unknown'),
                    # Pinecone stores metadata numbers as doubles, so these come
                    # back as 20.0 rather than 20. Left uncoerced they render as
                    # "file.tsx:1.0-18.0", which fails the frontend citation
                    # regex and silently degrades every citation to plain text.
                    'line_start': _as_line_no(hit['fields'].get('line_start')),
                    'line_end': _as_line_no(hit['fields'].get('line_end')),
                    'chunk_type': hit['fields'].get('chunk_type', 'general_code'),
                    'score': hit.get('_score', 0),
                    'reranked': analysis['should_rerank'],
                    'filter_applied': bool(metadata_filter),
                })
                total_tokens += estimated_tokens

            print(f"[OK] Retrieved {len(processed_results)} chunks (~{total_tokens} tokens)")
            return processed_results

        except Exception as e:
            print(f"[ERROR] smart_retrieve failed: {e}")
            import traceback; traceback.print_exc()
            return []

    def _build_metadata_filter(self, file_hint, symbol_hints):
        """
        Build a Pinecone metadata filter from extracted hints.
          - file_hint alone → filter by file_name
          - symbols alone → filter chunks whose `symbols` list overlaps
          - both → require both
        Returns None if no hints (unfiltered search).
        """
        clauses = []
        if file_hint:
            clauses.append({"file_name": {"$eq": file_hint}})
        if symbol_hints:
            # Pinecone doesn't support $in on array fields in every plan; use $in
            # on the flattened list. If your index doesn't allow this, comment out.
            clauses.append({"symbols": {"$in": symbol_hints}})

        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    def _pinecone_search(self, query, namespace, analysis, filter_):
        """Wrapped Pinecone search so we can retry with/without a filter."""
        search_params = {
            "namespace": namespace,
            "query": {
                "inputs": {"text": query},
                "top_k": analysis['base_k'],
            },
            "fields": [
                "chunk_text", "file_name", "file_path", "language",
                "line_start", "line_end", "chunk_type",
            ],
        }
        if filter_:
            search_params["query"]["filter"] = filter_
        if analysis['should_rerank']:
            search_params["rerank"] = {
                "model": "bge-reranker-v2-m3",
                "top_n": analysis['rerank_top_n'],
                "rank_fields": ["chunk_text"],
            }
        return self.index.search(**search_params)

# Factory function to create the enhanced manager
def create_enhanced_pinecone_manager(index_name: str = "ai-code-reviewer") -> EnhancedPineconeManager:
    """Factory function to create enhanced Pinecone manager"""
    return EnhancedPineconeManager(index_name)
