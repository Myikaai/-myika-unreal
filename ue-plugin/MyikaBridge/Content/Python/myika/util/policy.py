"""Tool-surface policy for the Myika bridge.

A policy declares which tools are allowed to run, and (optionally) which
project-relative paths each path-taking tool may touch. Studios use this to
disable `run_python` entirely while keeping structured tools, or to clamp
read/write to a known subset of the project.

Resolution order at bridge startup:
  1. If `.myika/policy.json` exists at the project root, load it.
  2. Else fall back to the `default` profile (current open behavior).

A policy.json has the shape:

  {
    "profile": "safe-mode",         // optional — base profile to extend
    "enabled_tools": ["..."],       // optional — explicit list (overrides base)
    "path_allowlist": {             // optional — per-tool glob list (overrides base)
      "read_file":  ["Source/**", "..."],
      "write_file": ["Source/**", "..."]
    }
  }

The minimal config a studio needs is `{"profile": "safe-mode"}`.

C++ tools (paste_bp_nodes, connect_pins, etc.) currently route through a
separate dispatcher in the UE plugin's C++ code. Those need their own gate
that reads the same policy.json — tracked in SECURITY.md.
"""

import fnmatch
import json
import os
from dataclasses import dataclass, field

ALL_TOOLS = (
    "list_assets",
    "read_file",
    "write_file",
    "run_python",
    "get_compile_errors",
    "read_blueprint_summary",
    "paste_bp_nodes",
    "connect_pins",
    "set_pin_default",
    "add_timeline_track",
    "list_node_pins",
    "create_timeline",
    "create_material",
    "add_material_expression",
    "connect_material_expressions",
    "connect_material_property",
    "make_blinking_neon_material",
)


_ALL_SENTINEL = "__all__"


@dataclass(frozen=True)
class Policy:
    enabled_tools: frozenset
    # tool_name -> tuple of project-relative glob patterns. Missing key => no restriction.
    path_allowlist: dict = field(default_factory=dict)
    profile_name: str = "custom"

    def is_tool_allowed(self, tool_name: str) -> bool:
        # Default profile uses _ALL_SENTINEL to mean "anything registered" so
        # newly-added tools work without a policy.py edit. Strict / safe-mode
        # remain explicit allowlists.
        if _ALL_SENTINEL in self.enabled_tools:
            return True
        return tool_name in self.enabled_tools

    def is_path_allowed(self, tool_name: str, rel_path: str) -> bool:
        patterns = self.path_allowlist.get(tool_name)
        if not patterns:
            return True
        norm = rel_path.replace("\\", "/")
        return any(fnmatch.fnmatchcase(norm, p) for p in patterns)


_SAFE_MODE_PATHS = (
    "Source/**",
    "Plugins/**",
    "Config/**",
    "Content/Python/**",
    "docs/**",
    "*.uproject",
    "*.uplugin",
    "*.md",
    "*.txt",
    "*.ini",
)

_STRICT_READ_PATHS = (
    "Source/**",
    "Plugins/**",
    "Config/**",
    "docs/**",
    "*.uproject",
    "*.uplugin",
    "*.md",
    "*.ini",
)

PROFILES = {
    "default": Policy(
        # Open profile: anything registered in the dispatcher works. New tool
        # files dropped into myika/tools/ are allowed without a policy edit.
        enabled_tools=frozenset({_ALL_SENTINEL}),
        path_allowlist={},
        profile_name="default",
    ),
    "safe-mode": Policy(
        # run_python is the big one — disabled here. Structured tools stay.
        enabled_tools=frozenset(t for t in ALL_TOOLS if t != "run_python"),
        path_allowlist={
            "read_file":  list(_SAFE_MODE_PATHS),
            "write_file": list(_SAFE_MODE_PATHS),
        },
        profile_name="safe-mode",
    ),
    "strict": Policy(
        # read-only. No write_file, no run_python, no graph mutators.
        enabled_tools=frozenset({
            "list_assets",
            "read_file",
            "get_compile_errors",
            "read_blueprint_summary",
            "list_node_pins",
        }),
        path_allowlist={
            "read_file": list(_STRICT_READ_PATHS),
        },
        profile_name="strict",
    ),
}


def load_policy(project_dir: str) -> Policy:
    """Load .myika/policy.json from project_dir, or return the default profile."""
    policy_path = os.path.join(project_dir, ".myika", "policy.json")
    if not os.path.isfile(policy_path):
        return PROFILES["default"]

    try:
        with open(policy_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        # Fail closed: malformed policy => strict (read-only) so a corrupted
        # file can't accidentally widen the surface.
        print(f"[Myika] policy.json malformed ({e}), falling back to strict")
        return PROFILES["strict"]

    base_name = raw.get("profile", "default")
    base = PROFILES.get(base_name)
    if base is None:
        print(f"[Myika] unknown profile {base_name!r}, falling back to strict")
        return PROFILES["strict"]

    enabled = raw.get("enabled_tools")
    enabled_set = frozenset(enabled) if isinstance(enabled, list) else base.enabled_tools

    path_allowlist = raw.get("path_allowlist")
    if isinstance(path_allowlist, dict):
        merged_allowlist = {k: list(v) for k, v in path_allowlist.items() if isinstance(v, list)}
    else:
        merged_allowlist = dict(base.path_allowlist)

    return Policy(
        enabled_tools=enabled_set,
        path_allowlist=merged_allowlist,
        profile_name=f"{base_name}+overrides" if (enabled or path_allowlist) else base_name,
    )
