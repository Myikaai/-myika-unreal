# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it leaves the pre-release `0.x` series. Commits follow [Conventional Commits](CONTRIBUTING.md#commit-messages); user-visible changes update this file in the same PR.

## [Unreleased]

### Added
- Visual polish across chat, plan-review, settings, bridge-status, and toast components.
- Shared `useBridgeStatus` hook (`desktop/src/lib/useBridgeStatus.ts`).
- Test infrastructure: door and blink gate scripts, expanded stress tests, `verify-read-blueprint-summary.mjs`.
- Pulse gate (`tests/run-pulse-gate.ps1`, `tests/reset-pulse-baseline.ps1`): natural-language `BP_PulsingLight` 5x reliability gate, complementary to the door (NL prompt) and blink (T3D-snippet) gates. Asserts no duplicate components and no run_python retry loops.
- New `list_node_pins` C++ tool: returns each node's pins (name, direction, category, default) for a Blueprint graph. Lets the agent introspect graph state without needing the absent UE 5.7 Python pin enumeration.
- New `create_timeline` C++ tool: creates a `K2Node_Timeline` AND its backing `UTimelineTemplate` properly bound, via `FBlueprintEditorUtils::AddNewTimeline`. The only reliable way to make a working timeline; `paste_bp_nodes` for timelines creates a phantom default-named template that cannot accept track output pins.
- New material-graph tool family (Python): `create_material`, `add_material_expression`, `connect_material_expressions`, `connect_material_property`. Wraps `unreal.MaterialEditingLibrary` so the agent can build shaders end-to-end (Time / Frac / Round / ScalarParameter / VectorParameter / multiply nodes wired to `BaseColor` / `EmissiveColor` / `Metallic` / `Roughness` / `Normal` / `Opacity`).
- New high-level skill `make_blinking_neon_material` (Python): single tool call that wraps `create_material` + 9 `add_material_expression` + 8 `connect_material_expressions` + 2 `connect_material_property` calls into one. Exposes `BlinkSpeed` / `Color` / `Intensity` as runtime parameters. The first of the planned skill-wrapper layer (`make_pulsing_light_actor` is documented in [`docs/SKILLS/pulsing_light.md`](docs/SKILLS/pulsing_light.md) as a procedural recipe pending a C++ orchestrator).
- `docs/SKILLS/pulsing_light.md` — step-by-step Blueprint+Timeline recipe for "make a pulsing light" requests, since the C++ tools that this recipe orchestrates can't currently be invoked from a Python tool handler.
- `docs/ARCHITECTURE.md` and `docs/TOOL_REFERENCE.md` rewritten to be self-contained reference documents.
- `.github/` templates: pull-request template, bug-report and feature-request issue forms.
- `CONTRIBUTING.md` documenting Conventional Commits, branch model, PR expectations.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- `commitlint.config.cjs` documenting the commit-message rules.
- `.claude/settings.json` and `.claude/session-start.md` so Claude Code sessions on this repo see the project conventions at session start.

### Changed
- `read_blueprint_summary` handle filtering refined.
- `.gitignore` now excludes `CLAUDE-DEV.md` defensively. The agent's runtime context lives in a separate private tree.
- `connect_pins` and `set_pin_default` now list available input/output pin names when a pin lookup fails. Previously the agent had to introspect via `run_python` (which UE 5.7 does not support for K2Node pins), burning ~10 calls per failure.
- `add_timeline_track` self-heals when the K2Node_Timeline is missing its `UTimelineTemplate` (the typical post-`paste_bp_nodes` failure mode): creates the template via `FBlueprintEditorUtils::AddNewTimeline`. Errors when the K2Node itself is missing now list the available timeline node names.
- `connect_material_expressions` now lists the target expression's actual input pin names on failure (via `MaterialEditingLibrary.get_material_expression_input_names`) and explicitly notes that single-input nodes (Frac, Round, Sin, Cos, Abs, etc.) use the literal string `"None"` as their input pin name. Previously the agent burned ~7 calls on `run_python` introspection per failed connection.
- `myika.dispatcher.reload_tools()` now also re-runs `_load_tools()` so newly-added tool modules get picked up without restarting UE. Previously adding a tool required full editor restart for the dispatcher to see it.
- **Tool auto-discovery**: `_load_tools()` now scans `myika/tools/` via `pkgutil` instead of using a hardcoded list, and `dispatch()` re-scans once on `TOOL_NOT_FOUND` before failing. Dropping a new `*.py` file with `TOOL_NAME` + `handle()` is zero-config — the tool is live on first call, no editor restart, no `reload_tools` call, no list edit anywhere.
- **Default policy auto-allows new tools**: `default` profile's `enabled_tools` is now a sentinel meaning "anything registered" rather than a static `ALL_TOOLS` snapshot. New tool files no longer need a `policy.py` edit. `safe-mode` and `strict` profiles remain explicit allowlists for security purposes.
- Myika system prompt now includes a "Clarifying questions" directive: for build/create requests with unspecified design parameters (color, speed, purpose, scale, behavior), the agent asks 2–3 short focused questions before `propose_plan`. Question count scales with task size — none for trivial, 5–7 plus mid-build check-ins for large designs. Asks only about decisions that materially change the implementation, never about defaults the agent can sensibly pick.
- `policy.py` `ALL_TOOLS` was missing `set_pin_default` and `add_timeline_track` despite both being live C++ tools. Added them plus `list_node_pins`, `create_timeline`, and the four material tools. Strict profile now permits `list_node_pins` (read-only).

### Fixed
- `add_timeline_track` previously returned `success=true` but never created the K2Node output pin. Root cause: `UTimelineTemplate.FloatTracks.Add(NewTrack)` updates the storage array but `K2Node_Timeline::AllocateDefaultPins` reads tracks from a separate `TrackDisplayOrder` array (Engine/Private/K2Node_Timeline.cpp ~line 151). Now also calls `UTimelineTemplate::AddDisplayTrack(FTTTrackId(TT_FloatInterp, NewIdx))` so the pin actually materializes.
- WebSocket handshake used a non-RFC-6455 magic GUID (`...5AB5DC76B45B` instead of `...C5AB0DC85B11`). Standards-compliant clients (Python `websocket-client`, etc.) rejected the handshake. The Tauri/JS client wasn't validating, so the bug went unnoticed.

## [0.1.0-demo] - 2026-04-26

Initial public, demo-tagged release. Two-week proof of concept of an AI assistant native to Unreal Engine 5.7.

### Added
- WebSocket bridge protocol between the desktop app and the UE plugin (`ws://127.0.0.1:17645`, token-authenticated).
- Six Python tool handlers: `list_assets`, `read_file`, `write_file`, `run_python`, `get_compile_errors`, `read_blueprint_summary`.
- Four C++ graph-mutation tool handlers: `paste_bp_nodes`, `connect_pins`, `set_pin_default`, `add_timeline_track`.
- Synthetic `propose_plan` tool intercepted by the desktop tool proxy to drive the plan-review UI.
- Tauri 2 desktop app with single-conversation chat, streaming output, inline tool-call cards, settings pane, sticky error toasts, and bridge-status indicator.
- Auto Git checkpoint before any `write_file` call.
- Tool-surface policy via `.myika/policy.json` (`default` / `safe-mode` / `strict` profiles), gating Python tools and path access.
- Secret-name denylist and content scanner for file tools.
- Run journals (per-conversation JSONL) capturing every tool call and plan-review decision.
- Bridge token at `%LOCALAPPDATA%\Myika\bridge-token`; localhost-only listener.

### Security
- Established threat model and protections in [`SECURITY.md`](SECURITY.md). Roadmap items: encrypted token at rest (DPAPI), C++ tool gate consulting `policy.json`, provider routing for self-hosted LLMs.

[Unreleased]: https://github.com/Myikaai/myika-unreal/compare/v0.1.0-demo...HEAD
[0.1.0-demo]: https://github.com/Myikaai/myika-unreal/releases/tag/v0.1.0-demo
