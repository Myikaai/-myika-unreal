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

> **Caveat:** `paste_bp_nodes` creates a `K2Node_Timeline` but does **not** create the underlying `UTimelineTemplate` (the editor's `AddNewTimeline` path is not invoked). If you paste a timeline and then call `add_timeline_track`, you will get a structured error listing the available timeline templates plus a fix recipe. The fix is to call `FBlueprintEditorUtils::AddNewTimeline(BP, FName("YourName"))` via `run_python` before `add_timeline_track`, or to construct the timeline node entirely via `run_python`.

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

### `create_timeline`

Create a `K2Node_Timeline` AND its backing `UTimelineTemplate` properly bound. **The only reliable way to make a timeline.** `paste_bp_nodes` for a `K2Node_Timeline` creates a phantom default-named template that the K2Node never re-binds to, so subsequent `add_timeline_track` calls cannot generate output pins. This tool wraps `FBlueprintEditorUtils::AddNewTimeline` + `NewObject<UK2Node_Timeline>` + the proper binding sequence.

```json
// Request
{
  "asset_path": "/Game/Blueprints/BP_PulsingLight",
  "graph_name": "EventGraph",
  "timeline_name": "PulseTimeline",
  "loop": true,
  "auto_play": false,
  "node_pos_x": -200,
  "node_pos_y": 0
}

// Response
{"success": true, "node_name": "K2Node_Timeline_0", "timeline_name": "PulseTimeline"}
```

The returned `node_name` is what to pass to subsequent `add_timeline_track` and `connect_pins` calls. `timeline_name` may have a numeric suffix appended if the requested name collided with an existing timeline variable on the BP.

---

## Material-graph tools

These build `UMaterial` shaders end-to-end via `unreal.MaterialEditingLibrary`. They run as Python tools (no C++ rebuild needed for new node types).

**When to use materials:** pure visual effects (blinking neon, pulsing emissive, animated UVs, fresnel rim, panning textures). For gameplay-driven behaviour, use a Blueprint with a Timeline instead.

### `create_material`

Create a new `UMaterial` asset.

```json
// Request
{"asset_path": "/Game/Materials/M_BlinkingNeon", "overwrite": true}

// Response
{"success": true, "asset_path": "/Game/Materials/M_BlinkingNeon", "created": true}
```

### `add_material_expression`

Add a node (Time, Multiply, Frac, Round, ScalarParameter, VectorParameter, Constant, Lerp, TextureSample, etc.) to a material. Returns the auto-named node so subsequent `connect_material_*` calls can reference it.

```json
// Request
{
  "asset_path": "/Game/Materials/M_BlinkingNeon",
  "expression_type": "ScalarParameter",
  "parameter_name": "BlinkSpeed",
  "default_scalar": 5.0,
  "node_pos_x": -800,
  "node_pos_y": 150
}

// Response
{
  "success": true,
  "expression_name": "MaterialExpressionScalarParameter_0",
  "expression_class": "MaterialExpressionScalarParameter",
  "applied": {"parameter_name": "BlinkSpeed", "default_scalar": 5.0}
}
```

`expression_type` accepts a short name (`Time`, `Multiply`, `Frac`, `Round`, `ScalarParameter`, `VectorParameter`, `Constant`, `Lerp`, `TextureSample`, ...) or a full UE class (`MaterialExpressionMultiply`).

For `ScalarParameter` / `VectorParameter`, set `parameter_name` and `default_scalar` / `default_vector` to expose runtime parameters. `default_vector` is `{r, g, b, a}`.

### `connect_material_expressions`

Wire one expression's output to another's input. `from_pin` empty string = default output (most expressions have only one).

```json
// Request
{
  "asset_path": "/Game/Materials/M_BlinkingNeon",
  "from_node": "MaterialExpressionTime_0",
  "from_pin": "",
  "to_node": "MaterialExpressionMultiply_0",
  "to_pin": "A"
}

// Response
{"success": true, "from": "MaterialExpressionTime_0.<default>", "to": "MaterialExpressionMultiply_0.A"}
```

Common `to_pin` names: `A`, `B` (Multiply/Add/Subtract/Divide), `Alpha` (Lerp), unnamed default (Frac/Round/Sin/Cos take their input on the default pin).

### `connect_material_property`

Wire an expression's output to a final material property channel. Call this last to drive the actual outputs.

```json
// Request
{
  "asset_path": "/Game/Materials/M_BlinkingNeon",
  "from_node": "MaterialExpressionMultiply_2",
  "property": "EmissiveColor"
}

// Response
{"success": true, "from": "MaterialExpressionMultiply_2.<default>", "property": "EmissiveColor"}
```

Allowed `property` values: `BaseColor`, `EmissiveColor`, `Metallic`, `Roughness`, `Specular`, `Normal`, `Opacity`, `OpacityMask`, `WorldPositionOffset`, `AmbientOcclusion`, `Refraction`, `PixelDepthOffset`, `SubsurfaceColor`.

---

### `list_node_pins`

Return each node's pins (name, direction, category, hidden flag, default value) for a Blueprint graph. Use after `connect_pins` or `set_pin_default` returns "pin not found" if you need more detail than the error message's pin-name list provides. Optionally scoped to a single `node_name`.

The agent should reach for this tool *only* when needed, since `connect_pins` and `set_pin_default` already include available pin names in their error messages. UE 5.7's Python API does not expose K2Node pin enumeration, so this is the supported introspection path.

```json
// Request
{
  "asset_path": "/Game/Blueprints/BP_PulsingLight",
  "graph_name": "EventGraph",
  "node_name": "K2Node_Timeline_PulseTimeline"
}

// Response
{
  "success": true,
  "nodes": [
    {
      "name": "K2Node_Timeline_PulseTimeline",
      "class": "K2Node_Timeline",
      "pins": [
        {"name": "Play", "direction": "input", "category": "exec", "is_hidden": false, "has_default_value": false},
        {"name": "Update", "direction": "output", "category": "exec", "is_hidden": false, "has_default_value": false},
        {"name": "PulseAlpha", "direction": "output", "category": "real", "sub_category": "float", "is_hidden": false, "has_default_value": false}
      ]
    }
  ]
}
```

---

## High-level skills

Skills wrap a fixed recipe of primitives into a single tool call so the agent doesn't have to orchestrate ten-plus calls when the user asks for a well-known target.

### `make_blinking_neon_material`

Build a complete blinking-neon material in one call. Wraps `create_material` + 9 `add_material_expression` + 8 `connect_material_expressions` + 2 `connect_material_property` calls. The resulting material exposes `BlinkSpeed` (scalar Hz), `Color` (vector RGBA), and `Intensity` (scalar) as runtime parameters so the user can live-tweak via a Material Instance.

Use when the user says "make a blinking neon / blinking light / strobing sign" and the desired behavior is a pure visual effect. For gameplay-driven pulse behavior tied to a `PointLightComponent`, use the Blueprint+Timeline path instead (see graph construction notes below).

```json
// Request (all fields optional)
{
  "asset_path": "/Game/Materials/M_BlinkingNeon",
  "blink_speed": 5.0,
  "intensity": 10.0,
  "color": {"r": 1.0, "g": 0.2, "b": 0.0, "a": 1.0},
  "overwrite": true
}

// Response
{
  "success": true,
  "asset_path": "/Game/Materials/M_BlinkingNeon",
  "parameters": {"BlinkSpeed": 5.0, "Intensity": 10.0, "Color": {"r":1.0,"g":0.2,"b":0.0,"a":1.0}},
  "nodes": {"Time": "MaterialExpressionTime_0", "BlinkSpeed": "MaterialExpressionScalarParameter_0", "...": "..."},
  "next_step": "Apply /Game/Materials/M_BlinkingNeon to a mesh in the level..."
}
```

The pulsing-light Blueprint+Timeline equivalent (`make_pulsing_light_actor`) is not yet wrapped as a single tool call — Python tools cannot synchronously invoke C++ tool handlers, so the recipe lives in [`docs/SKILLS/pulsing_light.md`](SKILLS/pulsing_light.md) for the agent to follow step by step until the C++ orchestrator lands.

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

1. **`paste_bp_nodes`** — creates non-timeline nodes (structural, no wiring).
2. **`create_timeline`** — creates any `K2Node_Timeline` nodes properly bound to a `UTimelineTemplate`. **Do not paste timeline nodes via T3D** — `paste_bp_nodes` doesn't invoke the editor's `AddNewTimeline` path so the K2Node ends up with a phantom default-named template that can never accept track output pins.
3. **`add_timeline_track`** — adds curve data and registers the track in `TrackDisplayOrder` so the K2Node generates the corresponding output pin.
4. **`connect_pins`** — wires nodes by name + pin name. `K2Node_CallFunction` and `K2Node_Timeline` regenerate all `PinId` GUIDs during `PostPasteNode`, so any `LinkedTo` references in the source T3D are silently broken; wiring by name is the only reliable approach.
5. **`set_pin_default`** — re-applies pin defaults clobbered by `ReconstructNode`.

`K2Node_MacroInstance` (FlipFlop, ForEachLoop, etc.) requires a `GraphGuid` that points into the version-specific `StandardMacros` module and is not trivially generatable. Use macro-free equivalents — bool variable + `Branch` instead of FlipFlop, manual loop instead of ForEachLoop.

## Choosing material vs Blueprint+Timeline

For visual effects, decide which graph subsystem fits before reaching for tools:

- **Material graph** — pure visuals (blinking neon, pulsing emissive, animated UVs, panning textures, fresnel rims, color cycling). Use `create_material` + `add_material_expression` + `connect_material_*`. Runs on the GPU, no per-frame BP tick.
- **Blueprint + Timeline** — gameplay-driven behaviour (door rotates on E, light fades when player picks up an item, character animates on damage, anything that needs to react to events or be queried at runtime). Use `create_timeline` + `add_timeline_track` + `connect_pins`.

Quick test: if "give the mesh a material that does X" satisfies the request, use materials. If the request involves *responding* to anything, use BP+Timeline.

## Errors

Tool errors surface through the bridge envelope with one of:

- `TOOL_NOT_FOUND` — tool name does not exist
- `TOOL_BLOCKED` — tool is disabled by the active `.myika/policy.json` profile
- `INVALID_ARGS` — argument validation failed
- `EXEC_ERROR` — handler raised
- `TIMEOUT` — exceeded 30 s

`TOOL_NOT_FOUND` wins over `TOOL_BLOCKED` so typos give a clear error rather than a misleading "blocked" message.
