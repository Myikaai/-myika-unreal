# Architecture

Myika Unreal is two cooperating processes: a Tauri desktop chat app and an Unreal Engine plugin. The desktop app drives the LLM loop and the editor plugin executes tool calls inside the running editor.

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Myika Desktop App           │  ws://  │  Unreal Engine 5.7+          │
│  (Tauri 2 + React)           │ ◄─────► │  + MyikaBridge Plugin        │
│                              │ :17645  │                              │
│  - Chat UI                   │         │  - WebSocket server          │
│  - Settings, history (SQLite)│         │  - Python tool dispatcher    │
│  - Claude Code CLI subprocess│         │  - C++ graph-mutation tools  │
│  - MCP bridge + tool proxy   │         │  - Editor lifecycle hooks    │
└──────────────────────────────┘         └──────────────────────────────┘
```

## Components

### Desktop app (`desktop/`)

- **Tauri 2 + Rust backend** — `tokio`, `tokio-tungstenite`, `rusqlite`. Holds the WebSocket client, SQLite for chat history, and the tool proxy that bridges MCP to the WS bridge.
- **React 18 + TypeScript + Vite + Tailwind 3 frontend** — chat, plan-review UI, settings, bridge-status indicator.
- **Claude Code CLI subprocess** — the desktop app spawns `claude --print --output-format stream-json --tools "" --mcp-config mcp-config.json`. The CLI runs the LLM loop (tool use, multi-turn, context management) while the desktop app streams events to the UI. Built-in CLI tools (Bash, Edit, etc.) are disabled with `--tools ""` so only Myika's UE-specific MCP tools are available.

### MCP bridge (`desktop/mcp-bridge-server.mjs`)

A small Node stdio server that exposes Myika's tools to the Claude Code CLI over the Model Context Protocol. It forwards tool calls over a local TCP socket to the tool proxy.

### Tool proxy (`desktop/src-tauri/src/tool_proxy.rs`)

Listens on `127.0.0.1:17646` for newline-delimited JSON tool calls from the MCP bridge. For most tools it relays the call over WebSocket to the UE plugin and streams the response back. The synthetic `propose_plan` tool is intercepted here — it triggers the plan-review UI in the desktop app and never reaches UE.

### UE plugin (`ue-plugin/MyikaBridge/`)

- **WebSocket server** (C++) bound to `127.0.0.1:17645`. Single-client; requires an `X-Myika-Token` header on the upgrade request.
- **Python dispatcher** routes incoming tool calls to handler modules under `Content/Python/myika/tools/` and gates them through a project-local policy file.
- **C++ tool handlers** for graph-mutation tools that need direct UE C++ APIs (the Python API cannot wire Blueprint graphs in 5.7).

## Data flow

1. The user sends a message in the desktop app.
2. The desktop app forwards it to the Claude Code CLI subprocess over stdin.
3. The CLI calls Anthropic with the configured MCP tool definitions.
4. When Claude requests a tool call, the CLI invokes it through MCP. The MCP bridge serializes it to JSON over TCP to the tool proxy.
5. The tool proxy intercepts `propose_plan` (used to gate multi-step changes) or relays everything else over WebSocket to the UE plugin.
6. The plugin dispatches the call to a Python handler or a C++ handler, executes it, and returns the result.
7. The CLI feeds the result back into the conversation and continues the loop until it produces a final assistant message.

## Bridge protocol

WebSocket on `ws://127.0.0.1:17645`. JSON messages, one per frame. See [`BRIDGE_PROTOCOL.md`](BRIDGE_PROTOCOL.md) for the message envelope, error codes, and event types.

## Security boundary

The plugin binds to localhost only and requires a 64-hex-char token on the WS upgrade. File tools enforce path containment, an extension allowlist, a secret-name denylist, and a content scanner. A project-local `.myika/policy.json` gates which Python tools may run and which paths each may touch. See [`../SECURITY.md`](../SECURITY.md).

## Storage

- **Chat history** — SQLite at `%APPDATA%\ai.myika.desktop\`.
- **Run journals** — JSONL per agentic run in the same directory; one event per line covering `run_start`, `tool_call`, `tool_result`, `plan_proposed/approved/cancelled`, `run_end`.
- **Bridge token** — `%LOCALAPPDATA%\Myika\bridge-token` (plaintext today; encrypted-at-rest is on the security roadmap).

## Why these choices

- **Tauri over Electron.** Smaller binary, faster startup, native feel; Rust gives a clean home for the WebSocket client, SQLite, and file I/O.
- **WebSocket over HTTP.** Bidirectional — UE pushes events (compile finished, error occurred) without polling; one persistent connection for chatty tool traffic.
- **Python tool handlers in UE.** The 5.7 Python API is mature for asset operations and avoids a C++ recompile per tool tweak. C++ is reserved for the WebSocket server itself and graph-mutation tools that need direct C++ APIs the Python wrapper does not expose.
- **Claude Code CLI as the agent shell.** The full LLM loop, prompt caching, and provider routing already exist in the CLI. Myika does not reimplement them; it spawns the CLI and exposes UE as an MCP tool surface.
