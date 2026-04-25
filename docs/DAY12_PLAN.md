# Day 12 Plan

## Morning: set_pin_default tool

C++ tool handler following the same pattern as `paste_bp_nodes` in `MyikaBridgeServer.cpp`.

**Interface:** `{asset_path, graph_name, node_name, pin_name, default_value}`

**Implementation reference:**
- `UEdGraphPin::DefaultValue` — the string field to set
- `FBlueprintEditorUtils::PropagateNodePinDefaultValue` — propagates to sub-pins (struct members)
- Pattern: load BP → find graph → find node by name → find pin by name → set DefaultValue → mark modified → compile → save

**Test cases:**
- Set RLerp B pin to `"0, 90, 0"` (the door rotation use case)
- Set PrintString InString to a custom value
- Invalid node/pin name returns structured error
- Stress test: add to `stress-test.mjs`

## Afternoon: add_timeline_track tool

Harder — requires creating `UTimelineTemplate` curve data programmatically.

**Interface:** `{asset_path, timeline_node_name, track_name, track_type, keyframes: [{time, value}]}`

**Implementation reference:**
- `UTimelineTemplate` — owns the float/vector curves
- `K2Node_Timeline::FindTimelineTemplateInBlueprint()` — gets the template from BP
- `UCurveFloat::CreateCurve()` or `FRichCurve::AddKey()` for keyframes
- UE engine source: `Engine/Source/Editor/Kismet/Private/STimeline*.cpp`
- After adding tracks: `ReconstructNode()` to regenerate output pins, then compile

**Test cases:**
- Add a float track with 2 keyframes (0.0→0.0, 1.0→1.0) to a pasted timeline node
- Verify the output pin appears on the timeline node
- Invalid timeline node name returns structured error
- Stress test: add to `stress-test.mjs`

## End of day: full agentic door scenario E2E

No captured snippets — agent generates T3D from scratch using:
1. `paste_bp_nodes` — create BeginPlay, Timeline, RLerp, SetRelativeRotation nodes
2. `connect_pins` — wire the graph
3. `set_pin_default` — set RLerp B to `"0, 90, 0"`
4. `add_timeline_track` — add float track with open/close keyframes

**Fallback (Configuration B):** If timeline tool is too hard, use a captured snippet with timeline + defaults baked in. Demo can ship either way.

## Day 12 visual polish (if time permits)

Design handoff bundle is committed at `docs/design/handoff/`. Visual pass on BridgeStatus, Chat, and ToastContainer components. This is CSS/animation work — no new functionality.
