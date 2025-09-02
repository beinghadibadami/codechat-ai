
import uuid
import os
import numpy as np
from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from pinecone import Pinecone, ServerlessSpec
from transformers import AutoTokenizer
from optimum.onnxruntime import ORTModelForFeatureExtraction

# Load environment variables
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# Constants
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
ONNX_MODEL_DIR = "./onnx_model"

# Validate ONNX model exists
if not os.path.exists(ONNX_MODEL_DIR):
    raise FileNotFoundError(f"ONNX model directory not found: {ONNX_MODEL_DIR}")
if not os.path.exists(os.path.join(ONNX_MODEL_DIR, "model.onnx")):
    raise FileNotFoundError(f"ONNX model file not found in {ONNX_MODEL_DIR}. Please run the export command first.")

# Load ONNX model and tokenizer
print("Loading tokenizer and ONNX model...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
ort_model = ORTModelForFeatureExtraction.from_pretrained(ONNX_MODEL_DIR)
print("Model loaded successfully!")

# Pinecone setup
pc = Pinecone(api_key=PINECONE_API_KEY)
index_name = "chat-with-code"

# Create index if not exists
if not pc.has_index(index_name):
    pc.create_index(
        name=index_name,
        dimension=384,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
index = pc.Index(index_name)

# Chunking logic (unchanged)
def chunk_documents(documents, chunk_size=500, chunk_overlap=50):
    """Split large documents into chunks for better context retrieval"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size, 
        chunk_overlap=chunk_overlap
    )
    return splitter.split_documents(documents)

# Helper: mean pooling used by MiniLM for sentence embeddings
def mean_pooling(model_output, attention_mask):
    """Apply mean pooling to token embeddings with attention mask"""
    # Validate input shape
    if len(model_output.shape) != 3:
        raise ValueError(f"Expected 3D tensor (batch_size, seq_len, hidden_size), got shape {model_output.shape}")
    
    token_embeddings = model_output  # Shape: (batch_size, seq_len, 384)
    input_mask_expanded = np.broadcast_to(
        np.expand_dims(attention_mask, -1), 
        token_embeddings.shape
    )
    sum_embeddings = np.sum(token_embeddings * input_mask_expanded, axis=1)
    sum_mask = np.clip(input_mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
    return sum_embeddings / sum_mask

# ONNX-based embedding function with robust error handling
def get_onnx_embeddings(texts):
    """Generate embeddings using ONNX model with proper error handling"""
    try:
        if isinstance(texts, str):
            texts = [texts]
        
        # Validate and clean input
        texts = [text.strip() for text in texts if text and text.strip()]
        if not texts:
            print("Warning: Empty text input, returning zero embedding")
            return np.zeros((384,))
        
        # Truncate very long texts to prevent memory issues
        texts = [text[:2000] if len(text) > 2000 else text for text in texts]
        
        # Tokenize input
        encoded_input = tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=256,
            return_tensors='np'
        )
        
        # Forward pass through ONNX model
        outputs = ort_model(
            input_ids=encoded_input["input_ids"],
            attention_mask=encoded_input["attention_mask"]
        )
        
        # Robust output handling for different ONNX export formats
        if isinstance(outputs, dict):
            model_output = outputs.get("last_hidden_state", list(outputs.values())[0])
        elif hasattr(outputs, 'last_hidden_state'):
            model_output = outputs.last_hidden_state
        else:
            model_output = outputs[0] if hasattr(outputs, '__getitem__') else outputs
        
        # Apply mean pooling
        embeddings = mean_pooling(model_output, encoded_input["attention_mask"])
        
        # L2 normalization for cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        normalized = embeddings / np.maximum(norms, 1e-8)  # Avoid division by zero
        
        # Return single embedding or batch
        return normalized[0] if len(normalized) == 1 else normalized
        
    except Exception as e:
        print(f"ONNX embedding error: {e}")
        # Return zero embedding as fallback
        embedding_dim = 384
        if isinstance(texts, list) and len(texts) > 1:
            return np.zeros((len(texts), embedding_dim))
        return np.zeros((embedding_dim,))

# Embed chunks and store vectors in Pinecone
def embed_and_store(chunks, namespace="default-session", file_path=None):
    """Embed text chunks and store in Pinecone with file information"""
    if not chunks:
        print("Warning: No chunks to embed and store")
        return
    
    vectors = []
    print(f"Processing {len(chunks)} chunks...")
    
    for i, chunk in enumerate(chunks):
        try:
            chunk_id = f"{namespace}-{uuid.uuid4()}"
            text = chunk.page_content
            
            # Skip empty chunks
            if not text.strip():
                continue
            
            # Generate embedding using ONNX model
            embedding = get_onnx_embeddings(text)
            
            # Validate embedding
            if embedding is None or np.all(embedding == 0):
                print(f"Warning: Zero embedding for chunk {i}, skipping")
                continue
            
            # Enhanced metadata with file information
            metadata = {
                "text": text,
                "file_name": os.path.basename(file_path) if file_path else "unknown",
                "file_path": file_path if file_path else "unknown",
                "chunk_index": i
            }
            
            vectors.append({
                "id": chunk_id,
                "values": embedding.tolist(),
                "metadata": metadata
            })
            
            if (i + 1) % 10 == 0:
                print(f"Processed {i + 1}/{len(chunks)} chunks")
                
        except Exception as e:
            print(f"Error processing chunk {i}: {e}")
            continue

    
    # Upsert vectors to Pinecone
    if vectors:
        try:
            index.upsert(vectors=vectors, namespace=namespace)
            print(f"Successfully stored {len(vectors)} vectors in namespace '{namespace}'")
        except Exception as e:
            print(f"Error storing vectors in Pinecone: {e}")
    else:
        print("No valid vectors to store")

# Retrieve most relevant chunks based on query similarity
def retrieve_top_chunks(query, namespace="default-session", k=5):
    """Retrieve most relevant chunks using semantic similarity search"""
    try:
        if not query.strip():
            print("Warning: Empty query")
            return []
        
        embedding = get_onnx_embeddings(query)
        
        if embedding is None or np.all(embedding == 0):
            print("Warning: Could not generate valid embedding for query")
            return []
        
        results = index.query(
            vector=embedding.tolist(),
            top_k=k,
            namespace=namespace,
            include_metadata=True
        )
        
        # Return both text and file information
        if results and "matches" in results:
            return [
                {
                    "text": match["metadata"]["text"],
                    "file_name": match["metadata"].get("file_name", "unknown"),
                    "file_path": match["metadata"].get("file_path", "unknown"),
                    "score": match["score"]
                }
                for match in results["matches"]
            ]
        else:
            print("No matches found")
            return []
            
    except Exception as e:
        print(f"Error retrieving chunks: {e}")
        return []
