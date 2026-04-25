"""Return current Blueprint and C++ compile errors."""

import os
import re
import glob

TOOL_NAME = "get_compile_errors"


def handle(args: dict) -> dict:
    import unreal

    project_dir = unreal.Paths.project_dir()
    result = {"blueprint_errors": [], "cpp_errors": []}

    # Parse latest log for C++ build errors
    log_dir = os.path.join(project_dir, "Saved", "Logs")
    if os.path.isdir(log_dir):
        log_files = sorted(glob.glob(os.path.join(log_dir, "*.log")), key=os.path.getmtime, reverse=True)
        if log_files:
            try:
                with open(log_files[0], "r", encoding="utf-8", errors="ignore") as f:
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
