# main_v2.py - Enhanced version with smart retrieval
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import shutil, tempfile, os, uuid
from typing import Dict,List, Optional
import uvicorn
from document_loader import clone_repo, load_code_files
from embed_store_v2 import create_enhanced_pinecone_manager
from query_llm import ask_llm
from fastapi import  Body, HTTPException
# from fastapi.responses import JSONResponse



app = FastAPI(title="Codechat AI")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:8080", "https://codechat-jgxg.onrender.com/"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Initialize enhanced Pinecone manager
pinecone_manager = create_enhanced_pinecone_manager()

# Session management
def generate_new_session():
    return {
        "namespace": str(uuid.uuid4()),
        "path": None,
        "files_processed": 0
    }

current_session = generate_new_session()

# Base directory to store uploaded/cloned repositories
DATA_DIR = os.getenv("DATA_DIR", "/tmp/rag-data")
os.makedirs(DATA_DIR, exist_ok=True)

class QueryRequest(BaseModel):
    message: str
    max_tokens: Optional[int] = 8000  # Allow token limit customization

class ConfigRequest(BaseModel):
    chunk_size: Optional[int] = 800
    chunk_overlap: Optional[int] = 100


def build_file_tree(root_path):
    """Build file tree structure"""
    def build_node(path):
        if os.path.isdir(path):
            return {
                "name": os.path.basename(path),
                "path": os.path.relpath(path, root_path),
                "type": "folder",
                "children": [build_node(os.path.join(path, f)) for f in sorted(os.listdir(path))]
            }
        else:
            return {
                "name": os.path.basename(path),
                "path": os.path.relpath(path, root_path),
                "type": "file"
            }
    
    try:
        return [build_node(os.path.join(root_path, f)) for f in sorted(os.listdir(root_path))]
    except Exception as e:
        print(f"Error building file tree: {e}")
        return []

@app.get("/file-tree")
def file_tree():
    """Get file tree structure of uploaded/cloned code"""
    global current_session
    
    folder = current_session.get("path")
    if not folder or not os.path.exists(folder):
        return JSONResponse({
            "success": False,
            "tree": [],
            "message": "No files uploaded yet"
        })
    
    try:
        tree = build_file_tree(folder)
        if not tree:
            return JSONResponse({
                "success": False,
                "tree": [],
                "message": "No files found in repository"
            })
        
        # Count actual files in the tree
        file_count = sum(1 for node in tree if node["type"] == "file")
        
        return JSONResponse({
            "success": True,
            "tree": tree,
            "root_path": folder,
            "total_files": file_count,
            "files_processed": current_session.get("files_processed", 0)
        })
    except Exception as e:
        print(f"Error building file tree: {e}")
        return JSONResponse({
            "success": False,
            "tree": [],
            "error": str(e)
        })


@app.get("/")
def health_check():
    return {
        "status": "ok", 
        "message": "RAG Code Reviewer is running",
        "features": ["hosted_embeddings", "reranking", "dynamic_topk", "token_management"]
    }

@app.post("/reset-session")
async def reset_session():
    """Reset session with cleanup"""
    global current_session
    
    # Cleanup old session
    if current_session["path"] and os.path.exists(current_session["path"]):
        shutil.rmtree(current_session["path"], ignore_errors=True)
    
    # Generate new session
    current_session = generate_new_session()
    
    return JSONResponse({
        "success": True,
        "message": "Session reset successfully",
        "namespace": current_session["namespace"]
    })

@app.post("/upload-file")
async def upload_files(
    files: List[UploadFile] = File(...),
    config: Optional[str] = Form(None)
):
    """Enhanced file upload with configurable chunking"""
    global current_session
    
    # Parse config if provided
    chunk_size = 800
    chunk_overlap = 100
    
    if config:
        try:
            import json
            config_data = json.loads(config)
            chunk_size = config_data.get('chunk_size', 800)
            chunk_overlap = config_data.get('chunk_overlap', 100)
        except:
            pass  # Use defaults
    
    temp_dir = tempfile.mkdtemp(dir=DATA_DIR)
    current_session["path"] = temp_dir
    
    try:
        # Save uploaded files
        for file in files:
            file_path = os.path.join(temp_dir, file.filename)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, "wb") as f:
                contents = await file.read()
                f.write(contents)
        
        # Load and process documents
        documents = load_code_files(temp_dir)
        if not documents:
            raise HTTPException(status_code=400, detail="No valid code files found")
        
        total_chunks = 0
        processed_files = 0
        
        for doc in documents:
            file_path = getattr(doc, 'metadata', {}).get('source', 'unknown')
            if hasattr(doc, 'source'):
                file_path = doc.source
            
            # Enhanced chunking
            chunks = pinecone_manager.chunk_documents([doc], chunk_size, chunk_overlap)
            
            if chunks:
                success = pinecone_manager.upsert_documents(
                    chunks, 
                    current_session["namespace"], 
                    file_path
                )
                
                if success:
                    total_chunks += len(chunks)
                    processed_files += 1
                    print(f"✅ Processed {os.path.basename(file_path)}: {len(chunks)} chunks")
        
        current_session["files_processed"] = processed_files
        
        return {
            "success": True,
            "message": f"Processed {total_chunks} chunks from {processed_files} files",
            "namespace": current_session["namespace"],
            "config": {"chunk_size": chunk_size, "chunk_overlap": chunk_overlap}
        }
        
    except Exception as e:
        print(f"❌ Error in upload_files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload-github")
async def upload_github(
    repo_url: str = Form(...),
    chunk_size: int = Form(800),
    chunk_overlap: int = Form(100)
):
    """Enhanced GitHub upload with configurable chunking"""
    global current_session
    
    try:
        # Clone into managed data directory
        folder = clone_repo(repo_url, base_dir=DATA_DIR)
        current_session["path"] = folder
        
        documents = load_code_files(folder)
        if not documents:
            raise HTTPException(status_code=400, detail="No valid code files found in repository")
        
        all_chunks = []
        processed_files = 0
        
        for doc in documents:
            file_path = getattr(doc, 'metadata', {}).get('source', 'unknown')
            if hasattr(doc, 'source'):
                file_path = doc.source
            
            chunks = pinecone_manager.chunk_documents([doc])
            
            # Add file info to each chunk
            for chunk in chunks:
                chunk.metadata.update({
                    'file_path': file_path,
                    'file_name': os.path.basename(file_path),
                    'language': pinecone_manager._get_file_type(file_path)
                })
            
            all_chunks.extend(chunks)
            processed_files += 1
        
        # SINGLE BATCH UPSERT
        if all_chunks:
            success = pinecone_manager.batch_upsert_documents(
                all_chunks, 
                current_session["namespace"]
            )
            print(f"✅ Batch upserted {len(all_chunks)} chunks from {processed_files} files")
        
        # Set files_processed in session
        current_session["files_processed"] = processed_files
        
        return JSONResponse({
            "success": True,
            "message": f"Repository processed: {len(all_chunks)} chunks from {processed_files} files",
            "namespace": current_session["namespace"]
        })
    
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(request: QueryRequest):
    """Enhanced chat with smart retrieval"""
    try:
        # Check if session has data
        if not current_session.get("path") or current_session.get("files_processed", 0) == 0:
            return JSONResponse({
                "success": False,
                "response": "No code repository has been uploaded yet. Please upload files or connect a GitHub repository first.",
                "metadata": {"chunks_found": 0}
            })
        
        # Smart retrieval with dynamic top-k and reranking
        retrieved_chunks = pinecone_manager.smart_retrieve(
            query=request.message,
            namespace=current_session["namespace"],
            max_tokens=request.max_tokens
        )
        
        if not retrieved_chunks:
            return JSONResponse({
                "success": True,
                "response": "I couldn't find relevant information in the uploaded code. Please try rephrasing your question or check if files were properly uploaded.",
                "metadata": {"chunks_found": 0}
            })
        
        # Build enhanced context with file information
        context_parts = []
        file_summary = {}
        
        for chunk_info in retrieved_chunks:
            file_name = chunk_info.get('file_name', 'unknown')
            language = chunk_info.get('language', 'unknown')
            score = chunk_info.get('score', 0)
            
            # Track file statistics
            if file_name not in file_summary:
                file_summary[file_name] = {'count': 0, 'language': language}
            file_summary[file_name]['count'] += 1
            
            # Format context with metadata
            context_header = f"**File: {file_name}** (Language: {language}, Score: {score:.4f})"
            context_parts.append(f"{context_header}\n{chunk_info['text']}")
        
        context = "\n\n---\n\n".join(context_parts)
        
        # Enhanced prompt with retrieval metadata
        enhanced_query = f"""
Based on the following code context from {len(file_summary)} files with {len(retrieved_chunks)} relevant chunks:

FILES INVOLVED: {', '.join([f"{name} ({info['language']})" for name, info in file_summary.items()])}

CONTEXT:
{context}

QUESTION: {request.message}

Please provide a comprehensive answer based on the code context above. Include file names when referencing specific code snippets.
"""
        
        response = ask_llm(enhanced_query)
        
        return JSONResponse({
            "success": True,
            "response": response,
            "metadata": {
                "chunks_found": len(retrieved_chunks),
                "files_involved": len(file_summary),
                "file_summary": file_summary,
                "retrieval_reranked": retrieved_chunks[0].get('reranked', False) if retrieved_chunks else False
            }
        })
    
    except Exception as e:
        print(f"❌ Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/session-info")
def get_session_info():
    """Enhanced session information"""
    global current_session
    
    # Check if session has actual data
    has_data = (
        current_session["path"] is not None and 
        os.path.exists(current_session["path"]) and 
        current_session.get("files_processed", 0) > 0
    )
    
    return {
        "namespace": current_session["namespace"],
        "has_data": has_data,
        "files_processed": current_session.get("files_processed", 0),
        "features": {
            "hosted_embeddings": True,
            "reranking": True,
            "dynamic_topk": True,
            "token_management": True
        }
    }

@app.post("/explain-file")
async def explain_file(request: Dict = Body(...)):
    """
    Dedicated endpoint for explaining files (embedded or non-embedded)
    Expected request: {"file_path": "path/to/file.py"}
    """
    try:
        file_path = request.get("file_path")
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        folder = current_session.get("path")
        if not folder or not os.path.exists(folder):
            raise HTTPException(status_code=400, detail="No code repository loaded")
        
        # Find the actual file
        abs_path = find_file_in_repo(folder, file_path)
        if not abs_path:
            return JSONResponse({
                "success": False,
                "response": f"File '{file_path}' not found in the repository",
                "metadata": {"source": "file_not_found"}
            })
        
        # Try embedded first, then fallback to direct read
        result = await try_embedded_explanation(abs_path, file_path) or await try_direct_explanation(abs_path)
        
        return result
        
    except Exception as e:
        print(f"❌ Error explaining file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def try_embedded_explanation(abs_path: str, file_path: str):
    """Try to explain using embedded chunks first"""
    try:
        # Search for chunks from this specific file
        search_query = f"file:{os.path.basename(abs_path)} content"
        results = pinecone_manager.smart_retrieve(
            query=search_query,
            namespace=current_session["namespace"],
            max_tokens=8000
        )
        
        # Filter to only chunks from this file
        file_chunks = [
            chunk for chunk in results 
            if chunk.get('file_path', '').endswith(abs_path.replace(current_session["path"], ''))
        ]
        
        if not file_chunks:
            return None  # No embedded chunks found
        
        # Build context from embedded chunks
        context_parts = []
        for chunk in file_chunks:
            context_parts.append(chunk['text'])
        
        context = "\n\n---\n\n".join(context_parts)
        file_name = os.path.basename(abs_path)
        
        prompt = f"""
Please explain the file **{file_name}** based on the following code sections:

{context}

Provide a comprehensive explanation including:
1. **Purpose**: What this file does
2. **Key Components**: Main functions, classes, or sections
3. **Dependencies**: Imports and external dependencies
4. **Role**: How it fits in the overall project architecture
"""
        
        response = ask_llm(prompt)
        
        return JSONResponse({
            "success": True,
            "response": response,
            "metadata": {
                "source": "embedded",
                "file_name": file_name,
                "chunks_used": len(file_chunks),
                "method": "vector_search"
            }
        })
        
    except Exception as e:
        print(f"Error in embedded explanation: {e}")
        return None


async def try_direct_explanation(abs_path: str):
    """Fallback to direct file reading"""
    try:
        content = read_file_with_limit(abs_path, max_size_kb=150, max_lines=600)
        
        if not content:
            return JSONResponse({
                "success": False,
                "response": f"Could not read file {os.path.basename(abs_path)}. It may be binary or corrupted.",
                "metadata": {"source": "read_error"}
            })
        
        file_name = os.path.basename(abs_path)
        file_ext = os.path.splitext(file_name)[1]
        file_size_kb = os.path.getsize(abs_path) // 1024
        is_truncated = "truncated" in content.lower()
        
        prompt = f"""
Please explain the file **{file_name}** (Size: {file_size_kb}KB):

{content}


{"Note: This file was not embedded in the vector database, so I'm reading it directly." + (" Content is truncated due to size." if is_truncated else "")}

Please provide:
1. **Purpose**: What this file does
2. **Key Components**: Main functions, classes, sections
3. **Dependencies**: Imports and external dependencies  
4. **Configuration**: If it's a config file, explain the settings
5. **Role**: How it fits in the project
"""
        
        response = ask_llm(prompt)
        
        return JSONResponse({
            "success": True,
            "response": response,
            "metadata": {
                "source": "direct_read",
                "file_name": file_name,
                "file_size_kb": file_size_kb,
                "was_truncated": is_truncated,
                "method": "direct_file_read"
            }
        })
        
    except Exception as e:
        print(f"Error in direct explanation: {e}")
        return JSONResponse({
            "success": False,
            "response": f"Error reading file: {str(e)}",
            "metadata": {"source": "error"}
        })


def find_file_in_repo(repo_folder: str, file_identifier: str) -> str:
    """Smart file finder"""
    # Try direct paths first
    potential_paths = [
        os.path.join(repo_folder, file_identifier),
        os.path.join(repo_folder, file_identifier.lstrip('/')),
    ]
    
    for path in potential_paths:
        if os.path.exists(path) and os.path.isfile(path):
            return path
    
    # Search by filename in entire repo
    for root, dirs, files in os.walk(repo_folder):
        for file in files:
            if file == file_identifier:
                return os.path.join(root, file)
    
    return None


def read_file_with_limit(file_path: str, max_size_kb: int = 150, max_lines: int = 600) -> str:
    """Read file with intelligent limits"""
    try:
        file_size = os.path.getsize(file_path)
        
        if file_size > max_size_kb * 1024:
            # Large file - read first N lines
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = []
                for i, line in enumerate(f):
                    if i >= max_lines:
                        break
                    lines.append(line)
                
                content = ''.join(lines)
                return content + f"\n\n... (File truncated - showing first {max_lines} lines of {file_size//1024}KB file)"
        else:
            # Small file - read entirely
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
                
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return None


# Additional endpoints for advanced features
# @app.get("/query-analysis/{query}")
# async def analyze_query(query: str):
#     """Analyze query to show retrieval strategy"""
#     analysis = pinecone_manager.query_analyzer.analyze_query(query)
#     return {
#         "query": query,
#         "analysis": analysis,
#         "strategy": {
#             "description": f"This {analysis['complexity']} complexity {analysis['intent']} query will retrieve {analysis['base_k']} chunks",
#             "reranking": "enabled" if analysis['should_rerank'] else "disabled"
#         }
#     }

if __name__ == "__main__":
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
