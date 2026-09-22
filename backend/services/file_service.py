"""
File handling service
"""
import os
from typing import Dict, List, Optional


def build_file_tree(root_path: str) -> List[Dict]:
    """
    Build file tree structure from root path
    
    Args:
        root_path: Root directory path
        
    Returns:
        List of file tree nodes
    """
    def build_node(path: str) -> Dict:
        """Recursively build tree node"""
        if os.path.isdir(path):
            try:
                children = [
                    build_node(os.path.join(path, f)) 
                    for f in sorted(os.listdir(path))
                ]
                return {
                    "name": os.path.basename(path),
                    "path": os.path.relpath(path, root_path),
                    "type": "folder",
                    "children": children
                }
            except PermissionError:
                return {
                    "name": os.path.basename(path),
                    "path": os.path.relpath(path, root_path),
                    "type": "folder",
                    "children": []
                }
        else:
            return {
                "name": os.path.basename(path),
                "path": os.path.relpath(path, root_path),
                "type": "file"
            }
    
    try:
        return [
            build_node(os.path.join(root_path, f)) 
            for f in sorted(os.listdir(root_path))
        ]
    except Exception as e:
        print(f"Error building file tree: {e}")
        return []


def find_file_in_repo(repo_folder: str, file_identifier: str) -> Optional[str]:
    """
    Find file in repository by path or name
    
    Args:
        repo_folder: Repository root folder
        file_identifier: File path or name to find
        
    Returns:
        Absolute path to file if found, None otherwise
    """
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


def read_file_with_limit(
    file_path: str, 
    max_size_kb: int = 150, 
    max_lines: int = 600
) -> Optional[str]:
    """
    Read file with intelligent limits
    
    Args:
        file_path: Path to file
        max_size_kb: Maximum file size in KB
        max_lines: Maximum number of lines to read for large files
        
    Returns:
        File content or None if read fails
    """
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


def count_files_in_tree(tree: List[Dict]) -> int:
    """
    Count total number of files in tree structure
    
    Args:
        tree: File tree structure
        
    Returns:
        Total number of files
    """
    count = 0
    for node in tree:
        if node["type"] == "file":
            count += 1
        elif node["type"] == "folder" and "children" in node:
            count += count_files_in_tree(node["children"])
    return count
