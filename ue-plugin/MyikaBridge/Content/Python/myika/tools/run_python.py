"""Execute arbitrary Python in the editor."""

import io
import sys
import json
import os
import datetime

TOOL_NAME = "run_python"


def handle(args: dict) -> dict:
    import unreal

    code = args["code"]
    capture = args.get("capture_output", True)

    _log_invocation(code)

    old_stdout = sys.stdout
    old_stderr = sys.stderr

    if capture:
        sys.stdout = captured_out = io.StringIO()
        sys.stderr = captured_err = io.StringIO()

    return_value = None
    try:
        exec_globals = {"unreal": unreal, "__builtins__": __builtins__}
        exec(code, exec_globals)
        if "_result" in exec_globals:
            return_value = str(exec_globals["_result"])
    finally:
        if capture:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

    result = {
        "stdout": captured_out.getvalue() if capture else "",
        "stderr": captured_err.getvalue() if capture else "",
        "return_value": return_value,
    }
    return result


def _log_invocation(code: str):
    """Log every run_python call to a JSONL file."""
    try:
        import unreal
        project_dir = unreal.Paths.project_dir()
        log_dir = os.path.join(project_dir, "Saved", "Myika")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "run_python_log.jsonl")
        entry = {
            "timestamp": datetime.datetime.now().isoformat(),
            "code": code,
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass
