"""Path safety enforcement for file operations."""

import os

ALLOWED_EXTENSIONS = {".cpp", ".h", ".cs", ".ini", ".json", ".py", ".md", ".txt", ".uproject", ".uplugin"}
BLOCKED_EXTENSIONS = {".uasset", ".umap", ".exe", ".dll", ".lib", ".pdb"}


def validate_path(project_dir: str, rel_path: str) -> str:
    """Validate and resolve a project-relative path. Returns absolute path or raises."""
    if ".." in rel_path:
        raise ValueError("Path traversal not allowed")

    full_path = os.path.normpath(os.path.join(project_dir, rel_path))
    if not full_path.startswith(os.path.normpath(project_dir)):
        raise ValueError("Path outside project root")

    ext = os.path.splitext(full_path)[1].lower()
    if ext in BLOCKED_EXTENSIONS:
        raise ValueError(f"Blocked file type: {ext}")
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type not in allowlist: {ext}")

    return full_path
