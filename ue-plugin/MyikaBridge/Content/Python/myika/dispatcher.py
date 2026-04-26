"""Routes incoming tool calls from the WebSocket bridge to handlers."""

import json
import io
import sys
import importlib
from typing import Any, Optional

from myika.util.policy import Policy, load_policy

TOOL_REGISTRY: dict[str, Any] = {}
_ACTIVE_POLICY: Optional[Policy] = None


def register_tool(name: str, handler):
    """Register a tool handler function."""
    TOOL_REGISTRY[name] = handler


def get_policy() -> Policy:
    """Return the active policy, lazy-loading on first call."""
    global _ACTIVE_POLICY
    if _ACTIVE_POLICY is None:
        try:
            import unreal
            project_dir = unreal.Paths.project_dir()
        except Exception:
            # Outside the editor (tests, tooling) — fall back to default profile.
            from myika.util.policy import PROFILES
            _ACTIVE_POLICY = PROFILES["default"]
            return _ACTIVE_POLICY
        _ACTIVE_POLICY = load_policy(project_dir)
        print(f"[Myika] Tool policy: {_ACTIVE_POLICY.profile_name}")
    return _ACTIVE_POLICY


def reload_policy():
    """Force-reload policy from disk. Returns the new policy."""
    global _ACTIVE_POLICY
    _ACTIVE_POLICY = None
    return get_policy()


def dispatch(tool_name: str, args: dict) -> dict:
    """Dispatch a tool call to its handler. Returns result dict."""
    handler = TOOL_REGISTRY.get(tool_name)
    if handler is None:
        return {"ok": False, "error": {"code": "TOOL_NOT_FOUND", "message": f"Unknown tool: {tool_name}"}}

    policy = get_policy()
    if not policy.is_tool_allowed(tool_name):
        return {"ok": False, "error": {
            "code": "TOOL_BLOCKED",
            "message": f"Tool {tool_name!r} disabled by policy {policy.profile_name!r}",
        }}

    try:
        result = handler(args)
        return {"ok": True, "result": result}
    except Exception as e:
        return {"ok": False, "error": {"code": "EXEC_ERROR", "message": str(e)}}


def dispatch_json(payload_str: str) -> str:
    """Entry point called from C++. Accepts JSON string, returns JSON string.

    This function is bulletproof — it will NEVER raise an exception.
    """
    try:
        try:
            payload = json.loads(payload_str)
        except (json.JSONDecodeError, TypeError) as e:
            return json.dumps({"ok": False, "error": {"code": "INVALID_JSON", "message": str(e)}})

        tool_name = payload.get("tool", "")
        args = payload.get("args", {})

        # Capture stdout/stderr during tool execution
        old_stdout, old_stderr = sys.stdout, sys.stderr
        captured_out, captured_err = io.StringIO(), io.StringIO()
        try:
            sys.stdout = captured_out
            sys.stderr = captured_err
            result = dispatch(tool_name, args)
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

        # Attach captured output if any
        stdout_val = captured_out.getvalue()
        stderr_val = captured_err.getvalue()
        if stdout_val or stderr_val:
            result["_captured"] = {"stdout": stdout_val, "stderr": stderr_val}

        try:
            return json.dumps(result)
        except (TypeError, ValueError) as e:
            return json.dumps({"ok": False, "error": {"code": "SERIALIZATION_ERROR", "message": str(e)}})

    except Exception as e:
        # Last-resort catch — should never happen but guarantees no exception escapes
        try:
            return json.dumps({"ok": False, "error": {"code": "INTERNAL_ERROR", "message": str(e)}})
        except Exception:
            return '{"ok": false, "error": {"code": "INTERNAL_ERROR", "message": "catastrophic failure"}}'


def reload_tools():
    """Hot-reload registered tool modules AND pick up any newly added tools.

    Useful after dropping a new tool file into myika/tools/ — no UE restart
    needed. Idempotent.
    """
    reloaded = []
    for tool_name, _handler in list(TOOL_REGISTRY.items()):
        for mod_key, mod in list(sys.modules.items()):
            if mod_key.startswith("myika.tools.") and hasattr(mod, "TOOL_NAME") and mod.TOOL_NAME == tool_name:
                try:
                    mod = importlib.reload(mod)
                    if hasattr(mod, "handle"):
                        TOOL_REGISTRY[tool_name] = mod.handle
                        reloaded.append(tool_name)
                except Exception as e:
                    print(f"[Myika] Failed to reload {tool_name}: {e}")
                break

    # Also pick up any new tools that have been dropped into _load_tools()
    # since the dispatcher last booted.
    before = set(TOOL_REGISTRY.keys())
    _load_tools()
    new_tools = sorted(set(TOOL_REGISTRY.keys()) - before)

    print(f"[Myika] Reloaded {len(reloaded)} tool(s): {', '.join(reloaded)}")
    if new_tools:
        print(f"[Myika] Newly registered: {', '.join(new_tools)}")


def _load_tools():
    """Auto-load all tool modules."""
    tool_modules = [
        "list_assets",
        "read_file",
        "write_file",
        "run_python",
        "get_compile_errors",
        "read_blueprint_summary",
        "create_material",
        "add_material_expression",
        "connect_material_expressions",
        "connect_material_property",
        "make_blinking_neon_material",
    ]
    for mod_name in tool_modules:
        try:
            mod = importlib.import_module(f"myika.tools.{mod_name}")
            if hasattr(mod, "TOOL_NAME") and hasattr(mod, "handle"):
                register_tool(mod.TOOL_NAME, mod.handle)
        except Exception as e:
            print(f"[Myika] Failed to load tool {mod_name}: {e}")


_load_tools()
