# Tool Reference

The agent operates through a small, explicit toolset rather than free-form code execution. All tools route through the WebSocket bridge ([`BRIDGE_PROTOCOL.md`](BRIDGE_PROTOCOL.md)) except the synthetic `propose_plan`, which is intercepted by the desktop tool proxy.

Path-taking tools (`read_file`, `write_file`) are gated by [`SECURITY.md`](../SECURITY.md): containment checks, extension allowlist, secret-name denylist, content scanner, and the project-local `.myika/policy.json` profile.

---

## Python tools

These run inside the editor's Python interpreter via the dispatcher under `ue-plugin/MyikaBridge/Content/Python/myika/`.

### `list_assets`

Enumerate UAssets in the project's asset registry with optional filters. Capped at 1000 results; `truncated` indicates the cap was hit.

```json
// Request
{"path_filter": "/Game", "class_filter": "Blueprint", "limit": 200}

// Response
{"assets": [{"path": "/Game/BP_Door", "class": "Blueprint", "name": "BP_Door"}], "truncated": false}
```

### `read_file`

Read a text file by project-relative path. Rejects path traversal, paths outside the project, binary asset extensions, secret-shaped filenames, and content matching a high-confidence secret pattern.

```json
// Request
{"path": "Source/MyProject/MyClass.cpp"}

// Response
{"path": "Source/MyProject/MyClass.cpp", "content": "...", "size_bytes": 1234}
```

### `write_file`

Write a text file at a project-relative path. Same containment + secret guards as `read_file`. Creates an automatic Git checkpoint commit before writing so the change is trivially reversible. `create_dirs` creates intermediate directories.

```json
// Request
{"path": "Source/MyProject/NewFile.cpp", "content": "...", "create_dirs": true}

// Response
{"path": "Source/MyProject/NewFile.cpp", "bytes_written": 1234}
```

### `run_python`

Execute arbitrary Python in the editor process. Captures stdout, stderr, and the last expression's value. Every call is appended to the run journal as a JSONL audit record. Disabled by the `safe-mode` and `strict` policy profiles.

```json
// Request
{"code": "import unreal; print(unreal.EditorLevelLibrary.get_editor_world())", "capture_output": true}

// Response
{"stdout": "...", "stderr": "", "return_value": "..."}
```

### `get_compile_errors`

Aggregate the current Blueprint and C++ compile errors from the editor logs. Useful as a verification step after `write_file` or `paste_bp_nodes`.

```json
// Request
{}

// Response
{"blueprint_errors": [...], "cpp_errors": [...]}
```

### `read_blueprint_summary`

Return a structured summary of a Blueprint asset: parent class, components, variables, functions, and events. Built via reflection over `SubobjectDataSubsystem` and the BP's class properties.

```json
// Request
{"asset_path": "/Game/BP_Door"}

// Response
{
  "name": "BP_Door",
  "parent_class": "Actor",
  "components": [...],
  "variables": [...],
  "functions": [...],
  "events": [...]
}
```

---

## C++ handlers

These run on the editor's game thread via dispatcher in `MyikaBridgeServer.cpp`. They wrap UE C++ APIs that the 5.7 Python wrapper does not expose. Together they form the four-step T3D workflow for programmatic Blueprint graph construction (see notes after the schemas).

### `paste_bp_nodes`

Paste T3D-format Blueprint clipboard text as nodes into a graph. Structural only — pin connections in the T3D are dropped (see notes).

```json
// Request
{
  "asset_path": "/Game/BP_Door",
  "graph_name": "EventGraph",
  "t3d_text": "Begin Object Class=..."
}

// Response
{"success": true, "nodes_pasted": 4}
```

### `connect_pins`

Wire pins by node name + pin name using `UEdGraphSchema::TryCreateConnection`. Run this after `paste_bp_nodes`.

```json
// Request
{
  "asset_path": "/Game/BP_Door",
  "graph_name": "EventGraph",
  "connections": [
    {
      "source_node": "K2Node_Event_0",
      "source_pin": "then",
      "target_node": "K2Node_CallFunction_0",
      "target_pin": "execute"
    }
  ]
}

// Response
{"success": true, "connections_made": 1}
```

### `set_pin_default`

Override a pin's default value after paste. Required because `ReconstructNode` (called during `PostPasteNode` for `K2Node_CallFunction` and `K2Node_Timeline`) overwrites `DefaultValue` from the T3D.

```json
// Request
{
  "asset_path": "/Game/BP_Door",
  "graph_name": "EventGraph",
  "node_name": "K2Node_CallFunction_0",
  "pin_name": "NewRotation",
  "default_value": "0, 90, 0"
}

// Response
{"success": true, "set_value": "0, 90, 0", "previous_value": "0, 0, 0"}
```

### `add_timeline_track`

Add a float or vector track with keyframes to a `UTimelineTemplate` after the timeline node has been pasted. Required because timeline T3D pastes structurally but curve data does not transfer.

```json
// Request
{
  "asset_path": "/Game/BP_Door",
  "timeline_node_name": "Timeline_0",
  "track_name": "DoorRotation",
  "track_type": "float",
  "keyframes": [
    {"time": 0.0, "value": 0.0},
    {"time": 1.0, "value": 90.0}
  ]
}

// Response
{"success": true, "track_added": "DoorRotation", "output_pin_added": true}
```

---

## Synthetic tool

### `propose_plan`

Intercepted by the tool proxy (`desktop/src-tauri/src/tool_proxy.rs`); never reaches UE. Renders the plan in the desktop app's PlanReview UI; the user approves or cancels.

```json
// Request
{
  "steps": [
    "Create BP_Door actor",
    "Add mesh + trigger components",
    "Wire interaction logic"
  ],
  "summary": "Build an interactable door"
}

// Response
{"approved": true}
```

---

## Notes on graph construction

Blueprint graph construction follows a fixed sequence because of how UE 5.7 handles paste:

1. **`paste_bp_nodes`** — creates nodes (structural, no wiring).
2. **`connect_pins`** — wires nodes by name + pin name. `K2Node_CallFunction` and `K2Node_Timeline` regenerate all `PinId` GUIDs during `PostPasteNode`, so any `LinkedTo` references in the source T3D are silently broken; wiring by name is the only reliable approach.
3. **`set_pin_default`** — re-applies pin defaults clobbered by `ReconstructNode`.
4. **`add_timeline_track`** — adds curve data for any pasted timeline nodes.

`K2Node_MacroInstance` (FlipFlop, ForEachLoop, etc.) requires a `GraphGuid` that points into the version-specific `StandardMacros` module and is not trivially generatable. Use macro-free equivalents — bool variable + `Branch` instead of FlipFlop, manual loop instead of ForEachLoop.

## Errors

Tool errors surface through the bridge envelope with one of:

- `TOOL_NOT_FOUND` — tool name does not exist
- `TOOL_BLOCKED` — tool is disabled by the active `.myika/policy.json` profile
- `INVALID_ARGS` — argument validation failed
- `EXEC_ERROR` — handler raised
- `TIMEOUT` — exceeded 30 s

`TOOL_NOT_FOUND` wins over `TOOL_BLOCKED` so typos give a clear error rather than a misleading "blocked" message.
