"""Capture Blueprint graph nodes from clipboard to a .t3d snippet file.

Workflow:
  1. In UE Blueprint editor, select the nodes you want to capture
  2. Ctrl+C to copy them
  3. Run this script via run_python with snippet_name argument
  4. The clipboard T3D text is saved to plugin/Content/Myika/Snippets/<name>.t3d

Usage from run_python:
  exec(open(r"<plugin>/Content/Python/myika/capture_snippet.py").read())
  capture("print_test")

Or inline:
  import subprocess
  clip = subprocess.run(["powershell", "-Command", "Get-Clipboard -Raw"],
                        capture_output=True, text=True, timeout=5)
  # ... save clip.stdout to file
"""

import subprocess, os


SNIPPETS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "Myika", "Snippets"
)


def capture(snippet_name):
    """Read OS clipboard and save as a .t3d snippet file."""
    # Read clipboard via PowerShell
    result = subprocess.run(
        ["powershell", "-Command", "Get-Clipboard -Raw"],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode != 0:
        print(f"[Myika] ERROR: PowerShell Get-Clipboard failed: {result.stderr}")
        return False

    text = result.stdout
    if not text.strip():
        print("[Myika] ERROR: Clipboard is empty. Copy nodes first (Ctrl+C in graph).")
        return False

    if "Begin Object" not in text:
        print("[Myika] ERROR: Clipboard doesn't contain T3D data. Copy BP nodes first.")
        print(f"[Myika] Clipboard preview: {text[:100]}")
        return False

    # Count nodes
    node_count = text.count("Begin Object")
    print(f"[Myika] Found {node_count} node(s) in clipboard")

    # Ensure snippets directory exists
    os.makedirs(SNIPPETS_DIR, exist_ok=True)

    # Save
    out_path = os.path.join(SNIPPETS_DIR, f"{snippet_name}.t3d")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"[Myika] Saved snippet to: {out_path}")
    print(f"[Myika] Size: {len(text)} chars, {node_count} node(s)")
    return True
