"""Routes incoming tool calls from the WebSocket bridge to handlers."""

import json
import importlib
from typing import Any

TOOL_REGISTRY: dict[str, Any] = {}


def register_tool(name: str, handler):
    """Register a tool handler function."""
    TOOL_REGISTRY[name] = handler


def dispatch(tool_name: str, args: dict) -> dict:
    """Dispatch a tool call to its handler. Returns result dict."""
    handler = TOOL_REGISTRY.get(tool_name)
    if handler is None:
        return {"ok": False, "error": {"code": "TOOL_NOT_FOUND", "message": f"Unknown tool: {tool_name}"}}
    try:
        result = handler(args)
        return {"ok": True, "result": result}
    except Exception as e:
        return {"ok": False, "error": {"code": "EXEC_ERROR", "message": str(e)}}


def _load_tools():
    """Auto-load all tool modules."""
    tool_modules = [
        "list_assets",
        "read_file",
        "write_file",
        "run_python",
        "get_compile_errors",
        "read_blueprint_summary",
    ]
    for mod_name in tool_modules:
        try:
            mod = importlib.import_module(f"myika.tools.{mod_name}")
            if hasattr(mod, "TOOL_NAME") and hasattr(mod, "handle"):
                register_tool(mod.TOOL_NAME, mod.handle)
        except Exception as e:
            print(f"[Myika] Failed to load tool {mod_name}: {e}")


_load_tools()
