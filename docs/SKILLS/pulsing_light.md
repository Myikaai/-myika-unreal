# Skill: Pulsing-Light Actor (Blueprint + Timeline)

This is the recipe the agent should follow when the user asks for "a pulsing light", "a light that breathes", "a light that fades in and out", or any similar gameplay-driven oscillating-intensity effect.

For purely visual blink/strobe (a glowing surface, a neon sign), use the [`make_blinking_neon_material`](../TOOL_REFERENCE.md#make_blinking_neon_material) tool instead — it's one call and runs on the GPU. This Blueprint+Timeline recipe is for cases where the pulse is part of the actor's behavior (e.g. fade out when a player picks something up, only run while in proximity, drive other gameplay off the curve).

## Why this is a procedural recipe and not one tool call

The C++ tool handlers (`paste_bp_nodes`, `connect_pins`, `set_pin_default`, `add_timeline_track`, `create_timeline`) cannot be invoked synchronously from a Python tool — they're separate dispatch paths. Until a `make_pulsing_light_actor` C++ orchestrator lands, the agent follows the steps below in order.

## Target end state

`/Game/Blueprints/BP_PulsingLight` — Actor blueprint with a `PointLightComponent`. On BeginPlay, a 2-second looping timeline drives a Lerp(100, 5000) into `SetIntensity` on the PointLight. Drop into a level and Play → light pulses 100 ↔ 5000 every 2 seconds.

## Step-by-step

1. **Create the Blueprint and PointLightComponent via `run_python`:**
   ```python
   import unreal
   asset_path = "/Game/Blueprints/BP_PulsingLight"
   if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
       unreal.EditorAssetLibrary.delete_asset(asset_path)
   asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
   factory = unreal.BlueprintFactory()
   factory.set_editor_property("ParentClass", unreal.Actor)
   bp = asset_tools.create_asset("BP_PulsingLight", "/Game/Blueprints", unreal.Blueprint, factory)

   subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
   handles = subsystem.k2_gather_subobject_data_for_blueprint(bp)
   params = unreal.AddNewSubobjectParams()
   params.set_editor_property("parent_handle", handles[0])
   params.set_editor_property("new_class", unreal.PointLightComponent)
   params.set_editor_property("blueprint_context", bp)
   subsystem.add_new_subobject(params)
   unreal.BlueprintEditorLibrary.compile_blueprint(bp)
   unreal.EditorAssetLibrary.save_asset(asset_path)
   ```
   Verify by calling `read_blueprint_summary` — confirm a `PointLight` component exists. Do **not** trust an empty `fail_reason` from `add_new_subobject` as a retry signal; it's a known UE 5.7 trap that causes duplicate components.

2. **Paste the five graph nodes (NOT the timeline) via `paste_bp_nodes`:**
   - `K2Node_Event_BeginPlay` (ReceiveBeginPlay override, pos -400, 0)
   - `K2Node_CallFunction_LerpFloat` (KismetMathLibrary::Lerp, pos 200, 80)
   - `K2Node_CallFunction_SetIntensity` (LightComponent::SetIntensity, pos 500, 0)
   - `K2Node_CallFunction_PrintString` (KismetSystemLibrary::PrintString, pos 800, 0) — optional, useful as a sanity probe
   - `K2Node_VariableGet_PointLight` (`MemberName="PointLight",bSelfContext=True`, pos 300, -100)

3. **Create the timeline node via `create_timeline`:**
   ```json
   {
     "asset_path": "/Game/Blueprints/BP_PulsingLight",
     "graph_name": "EventGraph",
     "timeline_name": "PulseTimeline",
     "loop": true,
     "auto_play": false,
     "node_pos_x": -200,
     "node_pos_y": 0
   }
   ```
   Capture `node_name` from the response (e.g. `K2Node_Timeline_PulseTimeline`) — needed for the next steps.
   **Do not paste timelines via T3D**; `paste_bp_nodes` produces a phantom default-named template that cannot accept track output pins.

4. **Add the curve track via `add_timeline_track`:**
   ```json
   {
     "asset_path": "/Game/Blueprints/BP_PulsingLight",
     "timeline_node_name": "<node_name from step 3>",
     "track_name": "PulseAlpha",
     "track_type": "float",
     "keyframes": [
       {"time": 0.0, "value": 0.0},
       {"time": 1.0, "value": 1.0},
       {"time": 2.0, "value": 0.0}
     ]
   }
   ```
   The track creates a `PulseAlpha` output pin on the timeline node.

5. **Wire the graph via `connect_pins`** (single call with all six wires):
   - `BeginPlay.then` → `<timeline>.Play`
   - `<timeline>.Update` → `SetIntensity.execute`
   - `<timeline>.PulseAlpha` → `LerpFloat.Alpha`
   - `LerpFloat.ReturnValue` → `SetIntensity.NewIntensity`
   - `VariableGet_PointLight.PointLight` → `SetIntensity.self`
   - `SetIntensity.then` → `PrintString.execute`

6. **Set the three pin defaults via `set_pin_default`:**
   - `LerpFloat.A` = `100.0`
   - `LerpFloat.B` = `5000.0`
   - `PrintString.InString` = `Pulse Update`

7. **Compile + save via `run_python`:**
   ```python
   import unreal
   bp = unreal.EditorAssetLibrary.load_asset("/Game/Blueprints/BP_PulsingLight")
   unreal.BlueprintEditorLibrary.compile_blueprint(bp)
   unreal.EditorAssetLibrary.save_asset("/Game/Blueprints/BP_PulsingLight")
   ```
   Then `get_compile_errors` — should return zero errors. Then `read_blueprint_summary` to verify final state.

## Common failures + fixes

- **`connect_pins` says `Source pin 'PulseAlpha' not found`** — the track was added but the pin never materialized. Diagnostic: re-call `add_timeline_track` with the same name; if it errors with "already exists", you have the FloatTracks/TrackDisplayOrder mismatch and the plugin needs the `AddDisplayTrack` fix (already shipped 2026-04-26).
- **PointLight component appears twice in the BP** — `add_new_subobject` was called twice because the agent retried on an empty `fail_reason`. Fix: never retry on `fail_reason == ""`; verify by reading back the returned handle.
- **`K2Node_MacroInstance` (FlipFlop / ForEachLoop) won't paste cleanly** — they need a `GraphGuid` into version-specific `StandardMacros`. Use a bool variable + `Branch` instead.

## Reference implementation

The end-to-end script that produces this exact target lives at `MyikaAI/.scratch/build_pulsing_light.py` (not in the public repo — driver script, not a deliverable). Run it to regression-test the toolchain or to inspect the canonical end state.
