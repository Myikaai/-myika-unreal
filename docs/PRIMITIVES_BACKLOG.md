# Myika Primitives Backlog

## Shipped

### paste_bp_nodes (Day 10)
C++ tool handler using `FEdGraphUtilities::ImportNodesFromText`. Pastes T3D text into any Blueprint graph (EventGraph, ConstructionScript, or named function graph). Compiles, saves, returns node count.

### connect_pins (Day 10)
C++ tool handler using `UEdGraphSchema::TryCreateConnection`. Connects Blueprint graph pins by node name + pin name. Supports batch connections — compiles and saves once after all wires are made. First test: 3/3 connections on agent-generated graph, zero errors.

### UMyikaInteractionComponent (Day 9)
C++ component handling overlap detection + Enhanced Input action + optional door-style rotation animation. Properties-only configuration — no graph wiring needed.

### Enhanced Input Assets (Day 9)
- `/MyikaBridge/Input/IA_Interact` — InputAction (E key)
- `/MyikaBridge/Input/IMC_Myika` — InputMappingContext
- Auto-registered by UMyikaInteractionComponent in BeginPlay

### set_pin_default (Day 12)
C++ tool handler to set pin default values by node name + pin name post-paste. Needed because `ReconstructNode` clobbers `DefaultValue` fields from generated T3D. Interface: `{asset_path, graph_name, node_name, pin_name, default_value}`. Returns `{success, set_value, previous_value}`.

### add_timeline_track (Day 12)
C++ tool handler to add float/vector tracks + keyframes to a `K2Node_Timeline` post-paste. Creates `UCurveFloat`/`UCurveVector` subobjects on `UTimelineTemplate`, then reconstructs the node to regenerate output pins. Interface: `{asset_path, timeline_node_name, track_name, track_type, keyframes: [{time, value}]}`. Returns `{success, track_added, output_pin_added}`.

## V1 Backlog

### read_bp_graph
Mirror of paste_bp_nodes — export nodes from a Blueprint graph as T3D text using `FEdGraphUtilities::ExportNodesToText`. Enables reading graph logic, diffing, and round-tripping. Reference research: `docs/RESEARCH/blueprintue_plugin.md` (verdict: not useful — that plugin delegates to user Ctrl+C; engine source is the right reference).

### capture_snippet helper
Dev tool (not user-facing). Reads clipboard after Ctrl+C in UE, saves as `.t3d` file in the Snippets directory. Already exists as Python script; could become a bridge tool.

### Door Toggle Snippet (door_toggle.t3d)
Captured T3D for a toggle door pattern: flipflop + timeline rotating mesh 90° on yaw. Used by the door scenario via paste_bp_nodes.

### Interaction Bind Snippet (interaction_bind.t3d)
Captured T3D for binding an interaction component's OnInteract delegate to a custom event. Used alongside door_toggle.t3d.

## V2 Research

### uasset-reader-js — binary .uasset parsing
Third-party JS library that parses UE `.uasset` binary files without requiring the editor. Relevant for agentic-without-editor workflows where Myika operates on a project from outside a running UE process (CI, headless inspection, pre-flight asset validation). Not building — capturing as a research item to revisit when we have a concrete need to read project state without booting the editor.
