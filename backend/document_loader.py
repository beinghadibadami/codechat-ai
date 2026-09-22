# ✅ FILE: document_loader.py
import os
import tempfile
import subprocess
# from langchain_community.document_loaders import TextLoader
from langchain_core.documents import Document
import fnmatch

# Supported file types for code loading.
# NOTE: every entry must end with a comma. Adjacent string literals without a
# comma silently concatenate (e.g. `.txt` `.sql` → `.txt.sql`) and drop both
# extensions from the list. This was a real bug in an earlier version.
SUPPORTED_EXTENSIONS = [
    # Major languages
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".c", ".cpp", ".go", ".rs",
    ".php", ".rb", ".swift", ".kt", ".cs", ".vb",
    # Web
    ".html", ".css", ".json", ".xml", ".yml", ".yaml",
    # Docs / notebooks
    ".ipynb", ".md", ".txt", ".rst",
    # Data / SQL
    ".sql", ".csv",
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



def clone_repo(git_url: str, base_dir: str | None = None, token: str | None = None) -> str:
    """
    Clone a GitHub repository to a temp directory.

    Args:
        git_url: HTTPS URL of the repository.
        base_dir: Optional parent directory (defaults to system temp).
        token: Optional GitHub Personal Access Token for private repos.
               Injected into the URL as https://<token>@github.com/...

    Flags used:
        --depth 1: Shallow clone. Only the latest commit, no history.
                   Turns a 1GB React clone into a 50MB one in ~3s.
        GIT_TERMINAL_PROMPT=0: Disables interactive credential prompts.
                   Without this, a failed auth blocks forever on stdin.
                   With it, git fails immediately with a clear error.
        core.askPass=echo / GIT_ASKPASS=echo: Belt-and-suspenders
                   fallback for older git versions that ignore
                   GIT_TERMINAL_PROMPT.
    """
    temp_dir = tempfile.mkdtemp(dir=base_dir) if base_dir else tempfile.mkdtemp()

    clone_url = git_url
    if token:
        # Only inject for github.com HTTPS URLs — never for other hosts
        if clone_url.startswith("https://github.com/"):
            clone_url = clone_url.replace("https://", f"https://{token}@", 1)
        elif clone_url.startswith("http://github.com/"):
            # Upgrade to https before injecting
            clone_url = clone_url.replace("http://", f"https://{token}@", 1)

    env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",  # Fail fast instead of prompting
        "GIT_ASKPASS": "echo",       # Fallback for older git
    }

    try:
        subprocess.run(
            [
                "git", "clone",
                "--depth", "1",              # Shallow — latest commit only
                "--single-branch",           # Only the default branch
                "--config", "core.askPass=echo",  # Extra guard on stdin
                clone_url,
                temp_dir,
            ],
            check=True,
            env=env,
            timeout=180,                     # 3 minutes hard cap
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        # Sanitize error output — never echo the token back to the user
        stderr = (e.stderr or "").replace(token or "\x00nothere\x00", "***")
        # Map common git errors to friendlier messages
        if "Authentication failed" in stderr or "could not read Username" in stderr:
            raise ValueError(
                "Authentication failed. For private repositories, provide a "
                "GitHub Personal Access Token with `repo` scope."
            )
        if "Repository not found" in stderr:
            raise ValueError(
                "Repository not found. Check the URL, and if it's private, "
                "provide a token with access to it."
            )
        raise ValueError(f"git clone failed: {stderr.strip() or e}")
    except subprocess.TimeoutExpired:
        raise ValueError("git clone timed out (repo too large or network too slow).")

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


