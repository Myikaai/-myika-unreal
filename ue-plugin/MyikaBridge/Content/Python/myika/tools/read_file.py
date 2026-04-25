"""Read a text file from the project."""

import os

from myika.util.secret_filter import is_blocked_basename, scan_content_for_secrets

TOOL_NAME = "read_file"

ALLOWED_EXTENSIONS = {".cpp", ".h", ".cs", ".ini", ".json", ".py", ".md", ".txt", ".uproject", ".uplugin"}
BLOCKED_EXTENSIONS = {".uasset", ".umap", ".exe", ".dll", ".lib", ".pdb"}


def handle(args: dict) -> dict:
    import unreal

    rel_path = args["path"]
    if ".." in rel_path:
        raise ValueError("Path traversal not allowed")

    secret_reason = is_blocked_basename(rel_path)
    if secret_reason:
        raise ValueError(f"Refusing to read potential secret file: {secret_reason}")

    project_dir = unreal.Paths.project_dir()
    full_path = os.path.normpath(os.path.join(project_dir, rel_path))

    if not full_path.startswith(os.path.normpath(project_dir)):
        raise ValueError("Path outside project root")

    ext = os.path.splitext(full_path)[1].lower()
    if ext in BLOCKED_EXTENSIONS:
        raise ValueError(f"Cannot read binary file type: {ext}")
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type not allowed: {ext}")

    if not os.path.isfile(full_path):
        raise FileNotFoundError(f"File not found: {rel_path}")

    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()

    secret_label = scan_content_for_secrets(content)
    if secret_label:
        raise ValueError(f"Refusing to return file: content contains {secret_label}")

    return {"path": rel_path, "content": content, "size_bytes": len(content.encode("utf-8"))}
