# Lessons Learned

## Day 10: C++ Handlers Over Synthetic Input

When a UE editor capability isn't exposed via Python, search the UE C++ source for how the editor itself implements it before reaching for synthetic input. Editor commands are almost always thin wrappers over a static C++ function we can call directly.

We lost ~half a day on Day 10 trying clip.exe / keybd_event / SendKeys / clipboard encoding before finding `FEdGraphUtilities::ImportNodesFromText`, which is the function UE's own paste handler calls internally. The game thread is blocked while `run_python` executes, so Slate can't process synthetic input events — they simply never arrive.

**Order of preference for new tool implementations:**
1. Native `unreal.*` Python API
2. `execute_console_command`
3. C++ handler wrapping a static UE function (exposed as a bridge tool)
4. Synthetic input (last resort, single keystroke, verified after)

## Day 9-10: UE5.7 Python API Cannot Wire Blueprint Graphs

The Python API can create Blueprints, add components (via SubobjectDataSubsystem), set properties, compile, and save — but it **cannot**:
- Wire node graphs (connect pins)
- Create Timeline nodes
- Set up event bindings in graphs
- Access `EdGraph.Nodes` (protected)

The solution is `paste_bp_nodes` using captured T3D snippets from real UE graphs.

## Day 9: SubobjectDataSubsystem Is the Only Working Component API

`bp.simple_construction_script` does NOT work in UE5.7 Python. The only working pattern for adding components to Blueprints programmatically is:
```python
subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
handles = subsystem.k2_gather_subobject_data_for_blueprint(bp)
root_handle = handles[0]
params = unreal.AddNewSubobjectParams()
params.set_editor_property("parent_handle", root_handle)
params.set_editor_property("new_class", unreal.MyComponent)
params.set_editor_property("blueprint_context", bp)
new_handle, fail_reason = subsystem.add_new_subobject(params)
```

## T3D Snippet Capture Workflow

Instead of hand-writing T3D, capture from real UE graphs:
1. Build the desired graph manually in UE
2. Select nodes, Ctrl+C
3. Run `capture_snippet.py` to read clipboard and save as `.t3d`
4. Use `paste_bp_nodes` tool to paste into target BPs

This ensures correct format for the current UE version (5.7 added `bSerializeAsSinglePrecisionFloat`, `ExportPath`, etc.).

## Day 10: Generated T3D Works When Seeded With Examples

The agent can generate valid T3D from scratch when given 1+ captured examples as format reference. `print_test.t3d` (BeginPlay → Print String) was sufficient to teach the format. Generated T3D for a 4-node door graph imported successfully — all nodes created with correct types and properties. Manual snippet capture is a bootstrap step, not an ongoing requirement.

## Day 10: Two-Tool Pattern (paste_bp_nodes + connect_pins)

Single-tool "paste with wires" is brittle because `K2Node_CallFunction` and `K2Node_Timeline` call `ReconstructNode` during `PostPasteNode`, which regenerates all `PinId` GUIDs. `LinkedTo` references in generated T3D point to the old GUIDs and silently break. The working pattern is:
1. `paste_bp_nodes` — creates nodes (structural only, no wiring)
2. `connect_pins` — wires nodes by name + pin name (uses `UEdGraphSchema::TryCreateConnection`)

First test: 3/3 connections succeeded on an agent-generated 4-node graph, zero errors.

## Day 10: ReconstructNode Clobbers Pin Default Values

`ReconstructNode` (called by `K2Node_CallFunction` during paste) overwrites `DefaultValue` fields from T3D. Example: an RLerp node's B pin was set to `"0, 90, 0"` in T3D but reverted to `"0, 0, 0"` after import. Workaround: set defaults post-paste via a `set_pin_default` tool (Day 11).

## Day 10: K2Node_MacroInstance Requires Exact GraphGuid

Macro instances (FlipFlop, ForEachLoop, etc.) need `GraphGuid` references pointing to the exact subgraph inside `StandardMacros`. These GUIDs are version-specific and not trivially generatable. Workaround: use macro-free equivalents (e.g., bool variable + Branch instead of FlipFlop).

## Day 10: Timeline Nodes Paste Structurally But Data Doesn't Carry

`K2Node_Timeline` imports as a node but `UTimelineTemplate` curve data (float tracks, keyframes) does not transfer via T3D. No float track output pins appear. Needs a separate `add_timeline_track` C++ handler that creates tracks and keyframes programmatically after the timeline node is pasted.

## Day 11: Session Handoff Requires Explicit Context Loading

Plans written into docs at the end of one session don't automatically reach the next session. Day 11 was originally scoped (in Day 10 closeout) as `set_pin_default` + `add_timeline_track`, but the next session received a different spec (run journal, bridge reconnect, error toasts) and executed against that without checking prior context. Result: scope swap without deliberate re-prioritization.

**Fix:** Every new agent session must start by reading the most recent Day-N closeout from LESSONS.md, the V1 priorities from PRIMITIVES_BACKLOG.md, and any open spec items before accepting today's work spec. The user-side fix: include those reads as the first instructions in any new session kickoff.
