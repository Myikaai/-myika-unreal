"""Execute arbitrary Python in the editor."""

import io
import sys
import json
import os
import threading
import datetime

TOOL_NAME = "run_python"

# Maximum execution time before we consider the script stuck.
# Only applies when safe_mode=True (used for untrusted code).
TIMEOUT_SECONDS = 30


def handle(args: dict) -> dict:
    import unreal

    code = args["code"]
    capture = args.get("capture_output", True)
    safe_mode = args.get("safe_mode", False)

    _log_invocation(code)

    if safe_mode:
        return _run_threaded(code, capture)
    else:
        return _run_direct(code, capture, unreal)


def _run_direct(code, capture, unreal):
    """Run on the game thread — UE APIs work but infinite loops freeze the editor."""
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

    return {
        "stdout": captured_out.getvalue() if capture else "",
        "stderr": captured_err.getvalue() if capture else "",
        "return_value": return_value,
    }


def _run_threaded(code, capture):
    """Run in a daemon thread — safe from infinite loops but UE APIs may crash."""
    import unreal

    result_box = [None]
    error_box = [None]
    captured_out = io.StringIO()
    captured_err = io.StringIO()

    def run():
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        try:
            if capture:
                sys.stdout = captured_out
                sys.stderr = captured_err
            exec_globals = {"unreal": unreal, "__builtins__": __builtins__}
            exec(code, exec_globals)
            return_value = str(exec_globals["_result"]) if "_result" in exec_globals else None
            result_box[0] = {
                "stdout": captured_out.getvalue() if capture else "",
                "stderr": captured_err.getvalue() if capture else "",
                "return_value": return_value,
            }
        except Exception as e:
            result_box[0] = {
                "stdout": captured_out.getvalue() if capture else "",
                "stderr": (captured_err.getvalue() if capture else "") + str(e),
                "return_value": None,
            }
            error_box[0] = e
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    worker.join(timeout=TIMEOUT_SECONDS)

    if worker.is_alive():
        return {
            "stdout": captured_out.getvalue() if capture else "",
            "stderr": f"Execution timed out after {TIMEOUT_SECONDS}s. "
                      "The script may still be running in a background thread.",
            "return_value": None,
            "timed_out": True,
        }

    if error_box[0] is not None:
        raise error_box[0]

    return result_box[0]


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
