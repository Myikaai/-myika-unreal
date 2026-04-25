"""Write a text file to the project."""

import os

TOOL_NAME = "write_file"

ALLOWED_EXTENSIONS = {".cpp", ".h", ".cs", ".ini", ".json", ".py", ".md", ".txt", ".uproject", ".uplugin"}


def handle(args: dict) -> dict:
    import unreal
    from myika.util.git_checkpoint import ensure_checkpoint

    rel_path = args["path"]
    content = args["content"]
    create_dirs = args.get("create_dirs", True)

    if ".." in rel_path:
        raise ValueError("Path traversal not allowed")

    project_dir = unreal.Paths.project_dir()
    full_path = os.path.normpath(os.path.join(project_dir, rel_path))

    if not full_path.startswith(os.path.normpath(project_dir)):
        raise ValueError("Path outside project root")

    ext = os.path.splitext(full_path)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type not allowed: {ext}")

    ensure_checkpoint(project_dir)

    if create_dirs:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

    # If a Python tool handler was modified, auto-reload so the next call
    # picks up the new version instead of the stale cached import.
    if rel_path.startswith("Plugins/") and rel_path.endswith(".py"):
        try:
            from myika.dispatcher import reload_tools
            reload_tools()
        except Exception:
            pass

    return {"path": rel_path, "bytes_written": len(content.encode("utf-8"))}
