"""Return current Blueprint and C++ compile errors."""

import os
import re

TOOL_NAME = "get_compile_errors"

# Only read the last N bytes of the log file to avoid slow scans
_TAIL_BYTES = 64 * 1024  # 64 KB


def handle(args: dict) -> dict:
    import unreal

    project_dir = unreal.Paths.project_dir()
    result = {"blueprint_errors": [], "cpp_errors": []}

    # Parse latest log for C++ build errors (tail only)
    log_dir = os.path.join(project_dir, "Saved", "Logs")
    if not os.path.isdir(log_dir):
        return result

    log_files = [f for f in os.listdir(log_dir) if f.endswith(".log") and not f.startswith("cef")]
    if not log_files:
        return result

    log_files.sort(key=lambda f: os.path.getmtime(os.path.join(log_dir, f)), reverse=True)
    log_path = os.path.join(log_dir, log_files[0])

    try:
        file_size = os.path.getsize(log_path)
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            if file_size > _TAIL_BYTES:
                f.seek(file_size - _TAIL_BYTES)
                f.readline()  # skip partial line
            for line in f:
                match = re.search(r"(.*?)\((\d+)\):\s*error\s*(.*)", line)
                if match:
                    result["cpp_errors"].append({
                        "file": match.group(1).strip(),
                        "line": int(match.group(2)),
                        "message": match.group(3).strip(),
                    })
    except Exception:
        pass

    return result
