# Myika Unreal

An AI assistant native to Unreal Engine 5. A desktop chat app pairs with an in-engine plugin to read, reason about, and modify your project — Blueprints, C++, assets, the editor itself.

> **Status:** Pre-release. Active development. Expect breaking changes.

## What it does

- Chat with an AI that can actually see and operate your UE project
- Propose-then-execute workflow: the agent plans, you approve, it builds
- Auto Git checkpoint before any write — easy to roll back
- Localhost-only bridge between the desktop app and the editor

## Architecture

```
┌──────────────────────┐         ┌─────────────────────────┐
│  Myika Desktop App   │  ws://  │  Unreal Engine 5.7+     │
│  (Tauri + React)     │ ◄─────► │  + MyikaBridge Plugin   │
│                      │ :17645  │                         │
└──────────────────────┘         └─────────────────────────┘
```

The desktop app handles chat, history, and the LLM loop. The plugin runs a token-authenticated WebSocket server inside the editor and dispatches tool calls to Python and C++ handlers.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/BRIDGE_PROTOCOL.md`](docs/BRIDGE_PROTOCOL.md) for details.

## Tools

The agent operates through a small, explicit toolset rather than free-form code execution. Current tools:

- `list_assets` — enumerate project assets with path/class filters
- `read_file` / `write_file` — text-file I/O with path containment and a secret denylist
- `run_python` — execute Python in the editor (audit-logged)
- `get_compile_errors` — surface current Blueprint and C++ errors
- `read_blueprint_summary` — structured summary of a Blueprint asset
- `paste_bp_nodes` / `connect_pins` — programmatic Blueprint graph construction

See [`docs/TOOL_REFERENCE.md`](docs/TOOL_REFERENCE.md).

## Requirements

- Windows 10 or 11
- Unreal Engine 5.7+
- Visual Studio 2022 with the **Game Development with C++** workload
- Node.js 20+ and Rust stable (for building the desktop app)
- Claude Code CLI installed and authenticated

## Install

> Detailed install steps land with the first tagged release. Until then, the repo is best treated as a development checkout.

```bash
git clone https://github.com/Myikaai/myika-unreal.git
cd myika-unreal

# Desktop app
cd desktop
npm install
npm run tauri dev

# UE plugin: copy ue-plugin/MyikaBridge into your project's Plugins/ folder,
# then regenerate project files and build.
```

## Security

Myika has access to your project files and can execute code in the editor. Read [`SECURITY.md`](SECURITY.md) before using on anything you care about. Highlights:

- Bridge is bound to `127.0.0.1` and requires a per-machine token
- File tools enforce path containment and refuse to touch common secret files
- Every `run_python` call is logged

If you're evaluating for a studio: the `SECURITY.md` roadmap calls out the items needed for company use (local LLM routing, encrypted token storage, tool-surface allowlists).

## Roadmap

See [`ROADMAP.md`](ROADMAP.md).

## License

MIT. See [`LICENSE`](LICENSE).
