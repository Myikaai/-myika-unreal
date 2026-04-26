# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it leaves the pre-release `0.x` series. Commits follow [Conventional Commits](CONTRIBUTING.md#commit-messages); user-visible changes update this file in the same PR.

## [Unreleased]

### Added
- Visual polish across chat, plan-review, settings, bridge-status, and toast components.
- Shared `useBridgeStatus` hook (`desktop/src/lib/useBridgeStatus.ts`).
- Test infrastructure: door and blink gate scripts, expanded stress tests, `verify-read-blueprint-summary.mjs`.
- `docs/ARCHITECTURE.md` and `docs/TOOL_REFERENCE.md` rewritten to be self-contained reference documents.
- `.github/` templates: pull-request template, bug-report and feature-request issue forms.
- `CONTRIBUTING.md` documenting Conventional Commits, branch model, PR expectations.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- `commitlint.config.cjs` documenting the commit-message rules.
- `.claude/settings.json` and `.claude/session-start.md` so Claude Code sessions on this repo see the project conventions at session start.

### Changed
- `read_blueprint_summary` handle filtering refined.
- `.gitignore` now excludes `CLAUDE-DEV.md` defensively. The agent's runtime context lives in a separate private tree.

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
