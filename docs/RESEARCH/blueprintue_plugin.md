# Research: blueprintUE C++ Plugin

**Source:** https://github.com/blueprintue/blueprintue-cpp-plugin
**Author:** Rancoud (blueprintue.com)
**Researched:** 2026-04-25
**Verdict:** Not useful as a reference for `read_bp_graph` — see "What this plugin actually does" below.

## 1. License

**MIT License.** Safe to borrow code with attribution.

`LICENSE` at repo root is a standard MIT text. Anything we adapt would only need a line in our NOTICE/credits referencing the project — no copyleft, no commercial restriction. That said, see Section 2: there's nothing here we'd actually want to copy for our use case.

## 2. ExportNodesToText approach

**The plugin does not call `ExportNodesToText`. It does not programmatically export nodes at all.**

I grepped every source file (.cpp/.h, both `Private/` and `Public/`) for `ExportNodesToText`, `ExportToText`, `CopyNodes`, `CopySelection` — zero matches. The plugin is a UI + HTTP shell:

- `SMain.cpp` — main tab widget with two sub-tabs (Create / Last Pasted)
- `SCreateBlueprint.cpp` — the "Create" tab. Renders a Slate form with: title field, exposure dropdown, expiration dropdown, UE-version dropdown, and **a multi-line `SMultiLineEditableTextBox` named `BlueprintMultiLineEditableTextBox`** that the user pastes T3D into manually
- `Api.cpp` — POSTs the form values to `https://blueprintue.com/api/upload` as URL-encoded body, with `X-Token` header from settings

The user workflow is: select nodes in the graph editor → Ctrl+C (UE's built-in copy, which internally calls `ExportNodesToText` against the active graph's selection) → Alt-tab to the plugin tab → Ctrl+V into the text box → click Create. The plugin never sees a `UEdGraph*`, never sees a `UEdGraphNode*`, never touches `FEdGraphUtilities`.

**Implications for our questions:**

- *How do they select nodes programmatically?* They don't. They delegate to the user.
- *Whole-graph vs subset?* Not their problem — whatever the user selected and Ctrl+C'd is what gets uploaded.
- *Timeline / function graph / macro handling?* No special handling. Whatever T3D the editor's copy command produces is what travels. If UE's copy includes timeline references as object paths (which it does — timelines live as `UTimelineTemplate` on the Blueprint, and copied nodes reference them by path), then those paste cleanly only if the destination Blueprint has the same timeline. The plugin doesn't try to fix this.

**Bottom line for `read_bp_graph`:** This plugin is the wrong reference. We need to look at UE engine source itself for callers of `FEdGraphUtilities::ExportNodesToText` — `SGraphEditorImpl::CopySelectedNodes` is the canonical one, in `Editor/GraphEditor/Private/SGraphEditorImpl.cpp`. The export side requires a `TSet<UObject*>` of nodes, which means we either replicate the editor's "what's selected" notion (we don't have a selection — we have a graph) or pass the whole graph's `Nodes` array converted to a set.

## 3. Version compatibility notes

README claims support for 4.26, 4.27, 5.0–5.6 (not 5.4 as our backlog assumed; the repo was updated to add 5.5 and 5.6 since we last looked).

The version-handling code in `SCreateBlueprint.h::InitUEVersion` is just a dropdown populator:

```cpp
for (int i = 6; i >= 0; --i) { ... "5.%d" ... }
for (int i = 27; i >= 0; --i) { ... "4.%d" ... }
```

The selected version string is sent as form metadata to blueprintue.com so their renderer knows which graph format to display. **The plugin treats the T3D as opaque text** — it never parses, transforms, or migrates between UE versions. So there are zero documented gotchas about graph-format changes here, because the plugin sidesteps the question entirely.

**For our 5.7 work this still matters** — we will hit format issues that the blueprintUE plugin never had to deal with. Things to watch out for, none of which this plugin can teach us:

- Timeline pin layouts changed shape in 5.x (the `Update`/`Finished` pins, internal direction-pin name shifts)
- Some node classes were deprecated/renamed across 4.x → 5.x; T3D from older versions can mention class paths that no longer resolve
- Variable references inside copied nodes serialize as path-and-guid; if the destination Blueprint's variable GUIDs differ, paste silently produces broken refs

We'll need to discover these the hard way or by reading engine release notes — the plugin doesn't help.

## 4. Build dependencies

From `Source/BlueprintUe/BlueprintUe.Build.cs`:

```
Public:  Core, UMG, WebBrowser, HTTP, Json
Private: Projects, InputCore, UnrealEd, ToolMenus, CoreUObject, Engine, Slate, SlateCore
```

Compared to what we added for `paste_bp_nodes` (UnrealEd, BlueprintGraph, Kismet, KismetCompiler):

| Module | blueprintUE | Myika paste_bp_nodes | Notes |
|---|---|---|---|
| `UnrealEd` | yes | yes | Both need editor-only APIs |
| `CoreUObject`, `Engine` | yes | (transitively) | Standard |
| `BlueprintGraph` | **no** | yes | They don't touch graphs; we do |
| `Kismet` | **no** | yes | Same — they have no compile path |
| `KismetCompiler` | **no** | yes | Same |
| `Slate`, `SlateCore`, `UMG`, `ToolMenus` | yes | no | UI-only — they're an editor tab; we're headless |
| `HTTP`, `Json`, `WebBrowser` | yes | no | Their upload + last-pasted iframe |
| `Projects`, `InputCore` | yes | no | Plugin-mgmt and Slate input plumbing |

**Nothing to add to our paste_bp_nodes deps based on this plugin.** Our four modules are correct for graph manipulation; their nine modules are correct for "editor tab that uploads HTTP." Different jobs.

When we go to implement `read_bp_graph`, we'll likely need the same four modules we already have — `FEdGraphUtilities::ExportNodesToText` lives in `BlueprintGraph` and we already link it. No new dependency expected.

## Summary recommendation

- **Don't borrow from this plugin.** It has no programmatic export logic — the design is "let the user Ctrl+C, paste the result into a text box." That's not the shape of `read_bp_graph`.
- **Do look elsewhere for reference.** Engine source: `SGraphEditorImpl::CopySelectedNodes` and the `FEdGraphUtilities::ExportNodesToText` definition itself. Also check community plugins that do programmatic graph diffing if any exist.
- **Re-verify this verdict before writing code.** Check `FEdGraphUtilities::ExportNodesToText` signature in 5.7 headers (`Editor/UnrealEd/Public/EdGraphUtilities.h`) — confirm input is `TSet<UObject*>` and output is `FString&`, then design `read_bp_graph` to feed the whole graph's `Nodes` array as the set when no filter is requested.
