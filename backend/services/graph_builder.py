"""
Import-graph builder for architecture diagrams.

Walks the session's repo, extracts imports from Python and JS/TS files,
resolves each import to a file in the repo (or ignores external packages),
and produces a Mermaid `graph LR` diagram.

Notes on accuracy:
- Regex-based, not AST. Handles the common cases well:
    Python:  `import x`, `from x import y`, `from .rel import z`
    JS/TS:   `import x from './foo'`, `import x from '../foo'`,
             `require('./foo')`, dynamic `import('./foo')`
- Skips external packages (numpy, react, express, etc.) — we only care about
  edges *within* the codebase.
- Skips test files and their dependencies (a heuristic) to keep the graph
  focused on the production dependency tree.
"""
import os
import re
from typing import Dict, List, Optional, Tuple, Set
from collections import defaultdict


# -------- Regexes ------------------------------------------------------

# Python imports. Two patterns, matched separately so we don't misparse:
#   1. `from foo.bar import x, y as z`   → capture "foo.bar"
#   2. `import foo, bar as b`             → capture "foo, bar"
# Both are anchored to end-of-line so we can't accidentally span lines.
PY_FROM_IMPORT = re.compile(r'^\s*from\s+([\w.]+)\s+import\s+[^\n]+$', re.MULTILINE)
PY_BARE_IMPORT = re.compile(r'^\s*import\s+([\w., ]+?)(?=\s*(?:#|$))', re.MULTILINE)
# Relative python imports: `from . import x`, `from .foo import y`, `from ..bar import z`
PY_REL_IMPORT = re.compile(r'^\s*from\s+(\.+)([\w.]*)\s+import', re.MULTILINE)

# JS/TS: `import x from 'path'`, `import 'path'`, `require('path')`, `import('path')`
JS_IMPORT = re.compile(
    r'''(?:
        import\s+(?:[\w{},*\s]+\s+from\s+)?['"]([^'"]+)['"]
      | require\s*\(\s*['"]([^'"]+)['"]\s*\)
      | import\s*\(\s*['"]([^'"]+)['"]\s*\)
    )''',
    re.VERBOSE,
)


# Extensions this builder understands
PY_EXTS = {'.py'}
JS_EXTS = {'.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'}
ALL_CODE_EXTS = PY_EXTS | JS_EXTS

# Directories to skip when walking the repo
SKIP_DIRS = {
    'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
    '.mypy_cache', '.pytest_cache', 'dist', 'build', 'out', '.next',
    'coverage', 'target', 'bin', 'obj', '.gradle', '.idea', '.vscode',
}

TEST_PATTERNS = re.compile(r'(?:^|/)(?:tests?|__tests__|spec|specs)(?:/|$)|\.(?:test|spec)\.', re.IGNORECASE)


def _walk_code_files(root: str) -> List[str]:
    """Yield relative paths to all code files under root, skipping build/deps."""
    files = []
    for dirpath, dirs, filenames in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in filenames:
            ext = os.path.splitext(name)[1]
            if ext in ALL_CODE_EXTS:
                rel = os.path.relpath(os.path.join(dirpath, name), root)
                files.append(rel.replace('\\', '/'))
    return files


def _resolve_python_import(
    module: str,
    from_file_rel: str,
    file_index: Dict[str, str],
    level: int = 0,
) -> Optional[str]:
    """
    Resolve a Python import (e.g. `foo.bar` or `.rel.mod`) to a file in the repo.
    Returns the relative path to the resolved file, or None if it's external.

    file_index maps relative-file → normalized-dotted-path (a/b/c.py → a.b.c)
    """
    if level > 0:
        # Relative import: walk up `level` directories from from_file_rel
        parts = from_file_rel.replace('\\', '/').split('/')
        # from_file_rel is a file, so its "package" is parts[:-1]
        up = level - 1  # `from .x` means level=1 = current package
        if up > len(parts) - 1:
            return None
        base_parts = parts[:-1][:len(parts) - 1 - up] if up > 0 else parts[:-1]
        target_parts = base_parts + (module.split('.') if module else [])
        candidate_dotted = '.'.join(target_parts)
    else:
        candidate_dotted = module

    # Try exact match
    for rel, dotted in file_index.items():
        if dotted == candidate_dotted:
            return rel
    # Try matching a package (dir with __init__.py)
    for rel, dotted in file_index.items():
        if dotted == candidate_dotted + '.__init__':
            return rel
    # Try suffix match (e.g. import x.y might match many_dirs/x/y.py — take shortest)
    matches = [rel for rel, dotted in file_index.items() if dotted.endswith('.' + candidate_dotted) or dotted == candidate_dotted]
    if matches:
        matches.sort(key=len)
        return matches[0]
    return None


def _resolve_js_import(
    spec: str,
    from_file_rel: str,
    all_files: Set[str],
) -> Optional[str]:
    """
    Resolve a JS/TS import spec to a file. Only cares about relative
    imports (./foo, ../bar). Skips external npm packages.
    """
    if not (spec.startswith('./') or spec.startswith('../')):
        return None  # external package

    from_dir = os.path.dirname(from_file_rel).replace('\\', '/')
    joined = os.path.normpath(os.path.join(from_dir, spec)).replace('\\', '/')

    # Try each of: exact, .ts, .tsx, .js, .jsx, /index.ts, /index.tsx, /index.js
    candidates = [
        joined,
        joined + '.ts', joined + '.tsx', joined + '.js', joined + '.jsx',
        joined + '/index.ts', joined + '/index.tsx',
        joined + '/index.js', joined + '/index.jsx',
    ]
    for c in candidates:
        if c in all_files:
            return c
    return None


def _extract_python_imports(text: str) -> List[Tuple[str, int]]:
    """Return list of (module_name, level). level=0 for absolute, >0 for relative."""
    imports: List[Tuple[str, int]] = []
    seen_positions: Set[int] = set()

    # Relative first, so we don't double-count via the from_import pattern
    for m in PY_REL_IMPORT.finditer(text):
        dots, mod = m.group(1), m.group(2) or ''
        imports.append((mod, len(dots)))
        seen_positions.add(m.start())

    # Absolute `from X import Y`
    for m in PY_FROM_IMPORT.finditer(text):
        if m.start() in seen_positions:
            continue
        imports.append((m.group(1), 0))

    # Bare `import X, Y as Z`
    for m in PY_BARE_IMPORT.finditer(text):
        import_list = m.group(1)
        for piece in import_list.split(','):
            # `foo as f` → `foo`
            name = piece.strip().split(' ')[0].split('\t')[0]
            if name and not name.startswith('.'):
                imports.append((name, 0))

    return imports


def _extract_js_imports(text: str) -> List[str]:
    specs = []
    for m in JS_IMPORT.finditer(text):
        spec = m.group(1) or m.group(2) or m.group(3)
        if spec:
            specs.append(spec)
    return specs


def _to_dotted(rel_path: str) -> str:
    """Convert `a/b/c.py` → `a.b.c` for Python module matching."""
    without_ext, _ = os.path.splitext(rel_path)
    return without_ext.replace('/', '.').replace('\\', '.')


def _short_label(rel_path: str, max_len: int = 32) -> str:
    """Compact node label — use just filename unless there's a collision."""
    name = os.path.basename(rel_path)
    if len(name) > max_len:
        return name[: max_len - 1] + '…'
    return name


def _safe_id(rel_path: str) -> str:
    """Mermaid-safe node id: replace non-alphanumerics with underscore."""
    return 'n_' + re.sub(r'[^A-Za-z0-9]', '_', rel_path)


def build_dependency_graph(root: str, max_nodes: int = 50, exclude_tests: bool = True) -> Dict:
    """
    Walk the repo and return a dict describing the import graph:
        {
            "nodes": [{"id", "label", "path", "language", "in_degree", "out_degree"}, ...],
            "edges": [{"from", "to"}, ...],
            "mermaid": "graph LR\n    ...",
            "stats": {"files_scanned": int, "internal_edges": int, "external_deps": [str, ...]},
        }
    """
    if not root or not os.path.exists(root):
        return {"nodes": [], "edges": [], "mermaid": "graph LR\n", "stats": {}}

    all_files = _walk_code_files(root)
    if exclude_tests:
        all_files = [f for f in all_files if not TEST_PATTERNS.search(f)]

    all_files_set = set(all_files)

    # Build a Python file index (relative_path → dotted_module_name)
    py_index = {f: _to_dotted(f) for f in all_files if os.path.splitext(f)[1] in PY_EXTS}

    edges: List[Tuple[str, str]] = []
    external_deps_counter: Dict[str, int] = defaultdict(int)

    for rel in all_files:
        abs_path = os.path.join(root, rel)
        try:
            with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
        except Exception:
            continue

        ext = os.path.splitext(rel)[1]

        if ext in PY_EXTS:
            for module, level in _extract_python_imports(text):
                if level > 0 or (module and not module.startswith(('numpy', 'pandas', 'os', 'sys', 're', 'json', 'typing', 'fastapi', 'pydantic'))):
                    # Try resolve as local
                    resolved = _resolve_python_import(module, rel, py_index, level)
                    if resolved and resolved != rel:
                        edges.append((rel, resolved))
                    elif level == 0 and module:
                        # External — track top-level name only
                        external_deps_counter[module.split('.')[0]] += 1
                else:
                    if module:
                        external_deps_counter[module.split('.')[0]] += 1

        elif ext in JS_EXTS:
            for spec in _extract_js_imports(text):
                resolved = _resolve_js_import(spec, rel, all_files_set)
                if resolved and resolved != rel:
                    edges.append((rel, resolved))
                elif not spec.startswith('.'):
                    # External — take package name (handle @scope/name)
                    if spec.startswith('@'):
                        name = '/'.join(spec.split('/')[:2])
                    else:
                        name = spec.split('/')[0]
                    external_deps_counter[name] += 1

    # De-duplicate edges
    edges = list(set(edges))

    # Compute node degrees
    in_deg: Dict[str, int] = defaultdict(int)
    out_deg: Dict[str, int] = defaultdict(int)
    for src, dst in edges:
        out_deg[src] += 1
        in_deg[dst] += 1

    # Rank files by total activity (degree), keep top max_nodes
    file_scores: Dict[str, int] = defaultdict(int)
    for f in all_files:
        file_scores[f] = in_deg[f] + out_deg[f]

    active = [f for f in all_files if file_scores[f] > 0]
    active.sort(key=lambda f: -file_scores[f])
    kept = set(active[:max_nodes])
    kept_edges = [(s, d) for s, d in edges if s in kept and d in kept]

    # Build nodes payload
    nodes = []
    for rel in sorted(kept):
        ext = os.path.splitext(rel)[1]
        lang = 'python' if ext in PY_EXTS else 'javascript' if ext in JS_EXTS else 'other'
        nodes.append({
            "id": _safe_id(rel),
            "label": _short_label(rel),
            "path": rel,
            "language": lang,
            "in_degree": in_deg[rel],
            "out_degree": out_deg[rel],
        })

    # Render Mermaid
    mermaid_lines = ["graph LR"]
    if not nodes:
        mermaid_lines.append('    empty["No internal dependencies detected"]')
    else:
        # Group nodes by top-level directory for readability
        groups: Dict[str, List[dict]] = defaultdict(list)
        for n in nodes:
            top = n["path"].split('/', 1)[0] if '/' in n["path"] else '(root)'
            groups[top].append(n)

        for group_name, group_nodes in groups.items():
            if len(groups) > 1:
                mermaid_lines.append(f'    subgraph {_safe_id(group_name)}["{group_name}"]')
            for n in group_nodes:
                # Node with label — escape quotes in label
                safe_label = n["label"].replace('"', "'")
                indent = '        ' if len(groups) > 1 else '    '
                mermaid_lines.append(f'{indent}{n["id"]}["{safe_label}"]')
            if len(groups) > 1:
                mermaid_lines.append('    end')

        for src, dst in kept_edges:
            mermaid_lines.append(f'    {_safe_id(src)} --> {_safe_id(dst)}')

    top_externals = sorted(external_deps_counter.items(), key=lambda x: -x[1])[:20]

    return {
        "nodes": nodes,
        "edges": [{"from": _safe_id(s), "to": _safe_id(d)} for s, d in kept_edges],
        "mermaid": '\n'.join(mermaid_lines),
        "stats": {
            "files_scanned": len(all_files),
            "internal_edges": len(edges),
            "kept_nodes": len(nodes),
            "kept_edges": len(kept_edges),
            "external_deps": [{"name": n, "count": c} for n, c in top_externals],
        },
    }
