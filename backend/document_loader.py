"""
Repository / upload loading and filtering.

The filtering here matters more than it looks. Anything that reaches the
chunker becomes vectors in Pinecone, and junk vectors don't just waste
storage — they actively degrade retrieval by competing with real code for
similarity. Two categories cause the most damage:

  1. Whole-repo aggregate files (llms.txt, repomix output, gitingest dumps).
     These concatenate the entire codebase into one text file. Indexing one
     means every function exists twice in the vector store: once from its real
     file with usable path/line metadata, and once buried inside a giant blob
     with none. Retrieval then cites the blob.

  2. Generated / data files (bundles, minified output, i18n catalogues, CSV
     dumps). Large, low signal, and nobody asks questions about them.

On top of the name/extension rules there is a hard per-file size cap, because
a single 5 MB file would otherwise produce thousands of chunks on its own.
"""
import os
import tempfile
import subprocess
import fnmatch
from dataclasses import dataclass, field
from typing import List, Tuple, Dict

from langchain_core.documents import Document


# --------------------------------------------------------------------------
# What we index
# --------------------------------------------------------------------------
# NOTE: every entry must end with a comma. Adjacent string literals without a
# comma silently concatenate (e.g. `.txt` `.sql` → `.txt.sql`) and drop both
# extensions from the list. This was a real bug in an earlier version.
SUPPORTED_EXTENSIONS = {
    # Major languages
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".c", ".h", ".cpp", ".hpp", ".go", ".rs",
    ".php", ".rb", ".swift", ".kt", ".cs", ".vb", ".scala", ".ex", ".exs",
    # Web
    ".html", ".css", ".scss", ".vue", ".svelte",
    # Config / structured (size-capped below)
    ".json", ".xml", ".yml", ".yaml", ".toml",
    # Docs
    ".md", ".mdx", ".txt", ".rst",
    # Notebooks
    ".ipynb",
    # SQL is code; CSV/TSV are data and deliberately excluded
    ".sql",
    # Shell
    ".sh", ".bash", ".ps1",
}

# Hard limits. A file bigger than this is either generated, vendored, or data.
MAX_FILE_BYTES = 150 * 1024          # 150 KB
# Notebooks and structured data carry a lot of non-prose overhead, so they get
# a tighter budget than source files.
MAX_STRUCTURED_BYTES = 64 * 1024     # 64 KB for .json/.ipynb/.xml
STRUCTURED_EXTENSIONS = {".json", ".ipynb", ".xml"}

# Refuse to index absurd trees outright rather than silently truncating.
MAX_FILES = 1200

# Files smaller than this carry no useful signal (empty stubs, placeholders).
MIN_FILE_BYTES = 12


# --------------------------------------------------------------------------
# Directories never worth indexing
# --------------------------------------------------------------------------
SKIP_DIRS = {
    # Dependencies.
    # NOTE: deliberately NOT skipping "packages" — pnpm/turbo monorepos keep
    # their real source there, so excluding it would index nothing.
    "node_modules", "bower_components", "vendor",
    ".venv", "venv", "env", "ENV", "virtualenv", "site-packages",
    # VCS / tooling metadata
    ".git", ".hg", ".svn", ".idea", ".vscode", ".vs",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
    # Build output
    "dist", "build", "out", "target", "bin", "obj", "release", "debug",
    ".next", ".nuxt", ".svelte-kit", ".output", ".parcel-cache",
    ".turbo", ".cache", "storybook-static", ".docusaurus",
    # Coverage / reports
    "coverage", ".nyc_output", "htmlcov",
    # Generated assets and data
    "__snapshots__", "snapshots", "fixtures", "testdata", "test-data",
    "locales", "i18n", "translations", "lang",
    "migrations",          # usually machine-generated and very repetitive
    ".gradle", ".mvn",
    # Vector stores / model artefacts that sometimes live in-repo
    "faiss_index", "chroma", ".chroma", "embeddings",
}


# --------------------------------------------------------------------------
# Exact filenames to skip
# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# Dependency manifests — ALWAYS indexed, and checked before every skip rule.
#
# These are the only authoritative answer to "what is this project built
# with". Excluding them (as an earlier version did) forced the model to infer
# the stack from string literals scattered through the code, which produced
# confidently wrong answers — e.g. reporting a portfolio site as using MongoDB
# and Shopify because those names appeared in a projects-showcase array.
# --------------------------------------------------------------------------
DEPENDENCY_MANIFESTS = {
    # JS / TS
    "package.json",
    # Python
    "requirements.txt", "requirements-dev.txt", "pyproject.toml",
    "Pipfile", "setup.py", "setup.cfg", "environment.yml",
    # Go / Rust / PHP / Ruby
    "go.mod", "Cargo.toml", "composer.json", "Gemfile",
    # JVM
    "build.gradle", "build.gradle.kts", "pom.xml", "build.sbt",
    # Others
    "pubspec.yaml", "mix.exs", "Package.swift", "deno.json",
    # Container / orchestration describe runtime deps too
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
}

MANIFEST_PATTERNS = ["*.csproj", "*.fsproj", "*.vbproj"]


SKIP_FILES = {
    # Lockfiles — enormous, redundant with the manifest, zero prose value
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "bun.lockb", "poetry.lock", "Pipfile.lock", "Cargo.lock", "composer.lock",
    "go.sum", "Gemfile.lock",
    # Build scaffolding with no dependency information
    "Makefile", "components.json",     # shadcn registry — pure config
    # Secrets / env
    ".gitignore", ".dockerignore", ".gitattributes", ".editorconfig",
    ".env", ".env.local", ".env.example", ".npmrc", ".nvmrc",
    # License / legal boilerplate
    "LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "NOTICE",
}


# --------------------------------------------------------------------------
# Whole-repo aggregate dumps — the highest-value thing to exclude.
# These tools each concatenate an entire codebase into one file.
# --------------------------------------------------------------------------
AGGREGATE_DUMP_PATTERNS = [
    "llms.txt", "llms-full.txt", "llms_full.txt", "llm.txt", "llms-*.txt",
    "repomix-output.*",           # repomix
    "gitingest*.txt", "digest.txt",  # gitingest
    "repo-context.*", ".repo-context.*",
    "codebase.txt", "codebase-*.txt",
    "all-code.*", "full-source.*",
    "*.repopack.*", "repopack-output.*",
]


# --------------------------------------------------------------------------
# Generated / derived file patterns
# --------------------------------------------------------------------------
SKIP_FILE_PATTERNS = [
    # Minified and bundled output
    "*.min.js", "*.min.css", "*.min.mjs",
    "*.bundle.js", "*.bundle.css", "*.chunk.js", "*-chunk-*.js",
    "bundle.js", "bundle.*.js", "vendor.js", "polyfills*.js", "runtime*.js",
    "*.map", "*.js.map", "*.css.map",
    # i18n / translation catalogues — huge, repetitive, no logic.
    # The `locales/` directory is pruned separately; these catch flat layouts.
    "messages.*.json", "*.messages.json", "*.i18n.json",
    "translation*.json", "*.translations.json", "strings.*.json",
    # Generated code
    "*.generated.*", "*_generated.*", "*.gen.go", "*.pb.go", "*.pb.py",
    "*_pb2.py", "*_pb2_grpc.py", "*.d.ts",
    "schema.graphql.d.ts", "*.codegen.*",
    # Tooling config (noise, not logic)
    "*.config.js", "*.config.ts", "*.config.cjs", "*.config.mjs",
    "tsconfig*.json", "jsconfig*.json",
    "webpack*.js", "rollup*.js", "vite*.js", "jest*.js", "karma*.js",
    "babel*.js", "eslint*.js", "postcss*.js", "tailwind*.js",
    ".eslintrc*", ".prettierrc*", ".babelrc*",
    # Test snapshots
    "*.snap",
    # Logs / temp / caches
    "*.log", "*.tmp", "*.temp", "*.cache", "*.pid", "*.seed",
    "*.lock", "*.env*",
    # Binary-ish artefacts that share a text extension
    "*.sqlite", "*.sqlite3", "*.db", "*.faiss", "*.pkl", "*.pickle",
    "*.parquet", "*.onnx", "*.h5", "*.npy", "*.npz", "*.bin",
    "*.jsonl", "*.ndjson",        # dataset formats
]


@dataclass
class LoadStats:
    """
    Why files were or weren't indexed. Surfaced to the UI so a user can tell
    the difference between "your repo has no code" and "we filtered it out".
    """
    indexed: int = 0
    total_bytes: int = 0
    skipped_dir: int = 0
    skipped_name: int = 0
    skipped_extension: int = 0
    skipped_too_large: int = 0
    skipped_too_small: int = 0
    skipped_binary: int = 0
    skipped_aggregate: int = 0
    skipped_unreadable: int = 0
    hit_file_cap: bool = False
    # A few examples per reason, for an explainable UI summary
    examples: Dict[str, List[str]] = field(default_factory=dict)

    def note(self, reason: str, name: str, limit: int = 5):
        bucket = self.examples.setdefault(reason, [])
        if len(bucket) < limit:
            bucket.append(name)

    @property
    def skipped_total(self) -> int:
        return (
            self.skipped_name + self.skipped_extension + self.skipped_too_large
            + self.skipped_too_small + self.skipped_binary
            + self.skipped_aggregate + self.skipped_unreadable
        )

    def as_dict(self) -> Dict:
        return {
            "indexed": self.indexed,
            "total_bytes": self.total_bytes,
            "skipped_total": self.skipped_total,
            "skipped": {
                "name": self.skipped_name,
                "extension": self.skipped_extension,
                "too_large": self.skipped_too_large,
                "too_small": self.skipped_too_small,
                "binary": self.skipped_binary,
                "aggregate_dump": self.skipped_aggregate,
                "unreadable": self.skipped_unreadable,
            },
            "hit_file_cap": self.hit_file_cap,
            "examples": self.examples,
        }


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


def _is_manifest(name: str) -> bool:
    """
    True for dependency manifests, which are exempt from the skip rules.

    Matched case-sensitively for exact names (Dockerfile, Gemfile) and
    case-insensitively for the project-file globs.
    """
    if name in DEPENDENCY_MANIFESTS:
        return True
    lower = name.lower()
    return any(fnmatch.fnmatch(lower, p) for p in MANIFEST_PATTERNS)


def _is_aggregate_dump(name: str) -> bool:
    """True for whole-codebase concatenation files (llms.txt and friends)."""
    lower = name.lower()
    return any(fnmatch.fnmatch(lower, p) for p in AGGREGATE_DUMP_PATTERNS)


def _matches_skip_pattern(name: str) -> bool:
    lower = name.lower()
    return any(fnmatch.fnmatch(lower, p) for p in SKIP_FILE_PATTERNS)


def _looks_binary(path: str, sniff_bytes: int = 8192) -> bool:
    """
    Detect binary content by looking for NUL bytes in the first few KB.

    Catches files that carry a text extension but hold binary payloads, which
    would otherwise be decoded into mojibake and embedded as noise.
    """
    try:
        with open(path, "rb") as f:
            return b"\x00" in f.read(sniff_bytes)
    except Exception:
        return True  # unreadable — treat as unusable


def _size_limit_for(ext: str) -> int:
    return MAX_STRUCTURED_BYTES if ext in STRUCTURED_EXTENSIONS else MAX_FILE_BYTES


def load_code_files_detailed(folder_path: str) -> Tuple[List[Document], LoadStats]:
    """
    Walk `folder_path` and return (documents, stats).

    Filtering order is cheapest-check-first: directory prune, then filename,
    then extension, then size (stat only), then binary sniff, and finally the
    actual read. That keeps the walk fast on large trees.
    """
    documents: List[Document] = []
    stats = LoadStats()

    for root, dirs, files in os.walk(folder_path):
        # Prune in place so os.walk never descends into them.
        # Also drop any dotted directory we don't explicitly want.
        before = len(dirs)
        dirs[:] = [
            d for d in dirs
            if d not in SKIP_DIRS and not (d.startswith(".") and d not in {".github"})
        ]
        stats.skipped_dir += before - len(dirs)

        for name in files:
            if stats.indexed >= MAX_FILES:
                stats.hit_file_cap = True
                return documents, stats

            # 0. Dependency manifests win over every other rule. They're small,
            #    and they're the only reliable source for "what is this built
            #    with" — worth indexing even when the extension rules or the
            #    generated-file patterns would otherwise reject them.
            is_manifest = _is_manifest(name)

            # 1. Whole-repo dumps — check before anything else, these are the
            #    most damaging thing we can index.
            if not is_manifest and _is_aggregate_dump(name):
                stats.skipped_aggregate += 1
                stats.note("aggregate_dump", name)
                continue

            # 2. Exact names and generated patterns
            if not is_manifest:
                if name in SKIP_FILES:
                    stats.skipped_name += 1
                    stats.note("name", name)
                    continue
                if _matches_skip_pattern(name):
                    stats.skipped_name += 1
                    stats.note("name", name)
                    continue

            # 3. Extension allow-list (manifests like Dockerfile have none)
            ext = os.path.splitext(name)[1].lower()
            if not is_manifest and ext not in SUPPORTED_EXTENSIONS:
                stats.skipped_extension += 1
                stats.note("extension", name)
                continue

            path = os.path.join(root, name)

            # 4. Size — stat is cheap, do it before opening
            try:
                size = os.path.getsize(path)
            except OSError:
                stats.skipped_unreadable += 1
                stats.note("unreadable", name)
                continue

            if size > _size_limit_for(ext):
                stats.skipped_too_large += 1
                stats.note("too_large", f"{name} ({size // 1024} KB)")
                continue
            if size < MIN_FILE_BYTES:
                stats.skipped_too_small += 1
                stats.note("too_small", name)
                continue

            # 5. Binary sniff
            if _looks_binary(path):
                stats.skipped_binary += 1
                stats.note("binary", name)
                continue

            # 6. Read
            try:
                with open(path, "r", encoding="utf-8", errors="strict") as f:
                    content = f.read()
            except (UnicodeDecodeError, OSError):
                # Retry leniently — some real source files have stray bytes
                try:
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                except Exception as e:
                    stats.skipped_unreadable += 1
                    stats.note("unreadable", f"{name}: {e}")
                    continue

            if not content.strip():
                stats.skipped_too_small += 1
                stats.note("too_small", name)
                continue

            documents.append(Document(page_content=content, metadata={"source": path}))
            stats.indexed += 1
            stats.total_bytes += size

    return documents, stats


def load_code_files(folder_path: str) -> List[Document]:
    """Backwards-compatible wrapper — returns documents only."""
    documents, _ = load_code_files_detailed(folder_path)
    return documents
