# ✅ FILE: document_loader.py
import os
import tempfile
import subprocess
# from langchain_community.document_loaders import TextLoader
from langchain_core.documents import Document
import fnmatch

# Supported file types for code loading
SUPPORTED_EXTENSIONS = [
    # Major languages
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".go", ".rs", ".php", ".rb", ".swift", ".kt", ".cs", ".vb",
    # Web
    ".html", ".css", ".json", ".xml", ".yml", ".yaml",
    # Notebooks
     ".ipynb",".md",".txt"
    # Data/SQL
    ".sql",".csv"
]

# Directories to skip (common dependency/build/hidden folders)
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "env", "venv", 
    ".mypy_cache", ".pytest_cache", ".vscode", ".idea", ".next", 
    "dist", "build", "out", ".nuxt", "coverage", ".nyc_output",
    "target", "bin", "obj", ".gradle", ".mvn"
}

SKIP_FILES = {
    "package-lock.json", "package.json", "yarn.lock", "pnpm-lock.yaml", 
    "poetry.lock", "Pipfile.lock", "pyproject.toml", "setup.py", 
    "setup.cfg", "environment.yml", "Dockerfile",
    ".gitignore", ".env", ".env.local", ".env.example"
}

SKIP_FILE_PATTERNS = [
    "*.config.js", "*.config.ts", "*.config.cjs", "*.config.mjs",
    "tsconfig*.json", "*.d.ts", "*.map", "*.min.js", "*.min.css",
    "webpack*.js", "rollup*.js", "vite*.js", "jest*.js",
    "*.lock", "*.log", "*.tmp", "*.cache", "*.env*"
]



def clone_repo(git_url, base_dir: str | None = None):
    # Clone the GitHub repository to a temporary directory (supports base_dir for persistence)
    temp_dir = tempfile.mkdtemp(dir=base_dir) if base_dir else tempfile.mkdtemp()
    subprocess.run(["git", "clone", git_url, temp_dir], check=True)
    return temp_dir



def load_code_files(folder_path):
    # Load all supported files as LangChain Documents
    documents = []
    for root, dirs, files in os.walk(folder_path):
        # Remove unwanted directories in-place
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for file in files:
            if file in SKIP_FILES:
                continue
            
            # Skip files matching patterns
            if any(fnmatch.fnmatch(file, pattern) for pattern in SKIP_FILE_PATTERNS):
                continue
                
            ext = os.path.splitext(file)[1]
            if ext.lower() in SUPPORTED_EXTENSIONS:
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                    documents.append(Document(page_content=content, metadata={"source": path}))
                except Exception as e:
                    print(f"Skipping {file}: {e}")
    return documents


