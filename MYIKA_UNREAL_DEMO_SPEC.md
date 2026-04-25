# Myika Unreal — Demo Spec

**For:** Claude Code agent building this project
**Owner:** Jacob (Myikaai)
**Target:** 2-week proof-of-concept demo
**Updated:** 2026-04-24

---

## 0. Read this first (Claude Code instructions)

You are building a 2-week demo of an AI assistant for Unreal Engine 5.7. This is **not** the production V1. The goal is a working end-to-end slice that proves the architecture and feels premium, recordable as a 2-minute demo video.

**Operating rules:**
- The user (Jacob) is comfortable with Blueprint and Python. Don't over-explain UE basics. Do explain non-obvious architecture choices.
- When you hit a real fork in the road (something that affects the architecture, the UX, or the user-facing behavior), **stop and ask**. Don't guess on direction-setting calls.
- When the choice is purely tactical (library version, file naming, code style within a file), **decide and proceed**. Note the decision in commit messages.
- Commit early and often. Each meaningful unit of work = one commit. Push to `main` for now (no PR ceremony for the demo).
- Hard rule: **never modify files in the user's Unreal projects without explicit instruction.** Your scope is the Myika tool itself, not test projects.
- If you discover a constraint that breaks the plan in this doc, stop and surface it before working around it.

**Things to ask the user before starting:**
1. What's the local path to the cloned `myika-unreal` repo?
2. What's their Anthropic API key? (For their `.env`, not committed.) Or do they want to set it themselves later?
3. Do they have a UE 5.7 test project already, or should we create a blank one for development?
4. Confirm: Windows 10 or 11? Visual Studio 2022 installed with Game Development with C++ workload?

---

## 1. Product context

Myika Unreal is an AI assistant native to Unreal Engine. It pairs an external desktop app (chat, mission control, project memory) with an in-engine plugin (tool execution surface). The AI reads the user's project, proposes or executes work, and learns the project over time.

**Demo positioning:** "Show that an external chat app can drive Unreal Engine to build a basic interactive system end-to-end via Claude tool use."

**V1 (post-demo) will add:** mission control board, multi-conversation, vector-DB memory, agentic mode with planning/dry-run/review, PBR texture pipeline, YouTube tutorial ingestion, RAG over UE docs, polished Fab packaging.

---

## 2. Demo scope (what ships in 2 weeks)

### In scope
- Tauri 2 desktop app with single chat window, dark premium UI, settings pane for API key
- In-engine UE 5.7 plugin exposing 6 tools via local WebSocket
- Chat connected to Anthropic API (Claude Sonnet 4.6 default), BYOK
- One end-to-end agentic flow that works: **"build me a basic interactable door"**
  - Agent plans steps, user approves, agent executes, agent reports back
- Pre-run Git checkpoint (auto-init repo in test project if needed)
- Conversation persistence in SQLite (single conversation, no multi-thread yet)

### Explicitly out of scope for the demo
- Multi-conversation, mission control board, project vector memory
- Texture pipeline
- YouTube ingestion
- UE docs RAG
- Local model support
- Fab packaging
- Cross-version UE support
- Anything past Windows
- Polished error UX (basic error surfacing is fine)

### Stretch goal (week 2 if ahead of schedule)
- YouTube transcript ingestion → planning step (no execution yet, just "show the plan")

---

## 3. Architecture

### High-level

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   Myika Desktop App     │         │  Unreal Engine 5.7       │
│   (Tauri + React)       │  WS     │  + Myika Plugin          │
│                         │ ◄─────► │                           │
│  - Chat UI              │ :17645  │  - C++ WebSocket server   │
│  - Settings             │         │  - Python tool handlers   │
│  - Claude API client    │         │  - Editor lifecycle hooks │
│  - SQLite (history)     │         │                           │
└────────────┬────────────┘         └──────────────────────────┘
             │
             │ HTTPS
             ▼
      ┌──────────────┐
      │ Anthropic API│
      └──────────────┘
```

The desktop app owns the LLM loop. It calls Claude with tools defined. When Claude requests a tool call, the app forwards it via WebSocket to the in-engine plugin, which executes it (mostly via UE's Python API) and returns the result. The app feeds the result back to Claude. Loop continues until Claude returns a final message.

### Why Tauri 2 over Electron
- Smaller binary, faster startup, native feel
- Rust backend gives us a clean place for the WebSocket client, SQLite access, file I/O
- React frontend keeps UI dev fast

### Why WebSocket over HTTP
- Bidirectional: UE can push events (compile finished, error occurred) without polling
- One persistent connection, lower overhead for chatty tool calls
- Easy to add streaming later

### Why Python tool handlers in UE
- UE's Python API is mature, well-documented, lets us touch nearly everything in the editor
- Faster iteration than recompiling C++ modules for every tool tweak
- C++ is reserved for the WebSocket server itself and the plugin module boilerplate

---

## 4. Repository layout

```
myika-unreal/
├── README.md
├── LICENSE                            # MIT
├── .gitignore                         # Includes UE Binaries/, Saved/, Intermediate/, node_modules/, target/
├── docs/
│   ├── ARCHITECTURE.md                # This doc, condensed
│   ├── BRIDGE_PROTOCOL.md             # WebSocket message spec (see §6)
│   └── TOOL_REFERENCE.md              # Tool list + schemas (see §7)
├── desktop/                           # Tauri app
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── src/
│   │       ├── main.rs
│   │       ├── bridge.rs              # WebSocket client to UE
│   │       ├── claude.rs              # Anthropic API client
│   │       ├── db.rs                  # SQLite (rusqlite)
│   │       └── tools.rs               # Tool schema definitions shared with Claude
│   ├── src/                           # React
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── Chat.tsx
│   │   │   ├── Message.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── BridgeStatus.tsx       # Shows "Connected to UE" / "Disconnected"
│   │   │   └── PlanReview.tsx         # Shown when agent proposes a multi-step plan
│   │   ├── styles/
│   │   │   └── theme.css
│   │   └── lib/
│   │       └── ipc.ts                 # Tauri IPC wrappers
│   ├── package.json
│   └── vite.config.ts
└── ue-plugin/                         # The UE plugin, drop-in to any project's Plugins/ folder
    └── MyikaBridge/
        ├── MyikaBridge.uplugin
        ├── Source/
        │   └── MyikaBridge/
        │       ├── MyikaBridge.Build.cs
        │       ├── Public/
        │       │   ├── MyikaBridge.h
        │       │   └── MyikaBridgeServer.h
        │       └── Private/
        │           ├── MyikaBridge.cpp
        │           └── MyikaBridgeServer.cpp        # WebSocket server (uses libwebsockets or asio)
        └── Content/
            └── Python/
                ├── myika/
                │   ├── __init__.py
                │   ├── dispatcher.py                # Routes incoming tool calls to handlers
                │   ├── tools/
                │   │   ├── __init__.py
                │   │   ├── list_assets.py
                │   │   ├── read_file.py
                │   │   ├── write_file.py
                │   │   ├── run_python.py
                │   │   ├── get_compile_errors.py
                │   │   └── read_blueprint_summary.py
                │   └── util/
                │       ├── git_checkpoint.py
                │       └── safe_paths.py            # Sandbox enforcement
```

---

## 5. Tech stack — exact versions and libraries

**Desktop app (Tauri):**
- Tauri 2.x (latest stable)
- Rust stable (whatever rustup gives)
- `tokio-tungstenite` for WebSocket client
- `rusqlite` (bundled feature) for SQLite
- `reqwest` for HTTPS to Anthropic
- `serde` + `serde_json` for everything JSON
- React 18, Vite, TypeScript 5
- TailwindCSS 3 for styling
- `@tauri-apps/api` for IPC
- No UI component library yet — hand-roll the demo's small surface area for design control

**UE plugin:**
- Unreal Engine 5.7
- C++ module: standard UE 5.7 build, no exotic deps
- For WebSocket server in C++: try **`WebSocketServer` from `Networking`/`WebSockets` modules** (UE has built-in WebSocket support); if that doesn't expose a server, fall back to a vendored single-header library like `cpp-httplib` or `uWebSockets`. Decide once you actually start writing the plugin and report back.
- Python: UE 5.7's bundled Python (3.11.x as of UE 5.x). No pip-installed external packages — keep the plugin self-contained for now.

**Anthropic SDK:**
- Don't use the Anthropic SDK in Rust (immature). Roll our own thin client around `reqwest`. The Messages API is simple enough.
- Model: `claude-sonnet-4-5` for default, `claude-opus-4-5` available as a setting.
  - **Verify these model strings before coding** — model names change. Use the Anthropic docs to confirm current IDs.

---

## 6. Bridge protocol (desktop ↔ UE plugin)

WebSocket on `ws://127.0.0.1:17645`. JSON messages, one per frame.

### Message envelope

```json
{
  "id": "uuid-v4",
  "type": "request" | "response" | "event",
  "payload": { ... }
}
```

### Request (desktop → UE)

```json
{
  "id": "abc-123",
  "type": "request",
  "payload": {
    "tool": "list_assets",
    "args": { "filter": "/Game/Maps" }
  }
}
```

### Response (UE → desktop)

```json
{
  "id": "abc-123",
  "type": "response",
  "payload": {
    "ok": true,
    "result": { ... }       // tool-specific shape
  }
}
```

Or on error:

```json
{
  "id": "abc-123",
  "type": "response",
  "payload": {
    "ok": false,
    "error": {
      "code": "TOOL_NOT_FOUND" | "EXEC_ERROR" | "TIMEOUT" | "INVALID_ARGS",
      "message": "Human-readable description"
    }
  }
}
```

### Event (UE → desktop, unsolicited)

For things like "compile finished," "user opened editor," etc. Demo only needs `bridge.ready` and `bridge.shutdown`.

```json
{
  "id": "evt-uuid",
  "type": "event",
  "payload": {
    "name": "bridge.ready",
    "data": { "ueVersion": "5.7.4", "projectName": "MyTestProject" }
  }
}
```

### Connection lifecycle

1. UE plugin starts the server on editor startup (post-engine-init).
2. Desktop app connects on app launch. Retries with backoff if UE isn't running.
3. On connection, UE emits `bridge.ready` event with project info.
4. Desktop app shows "Connected to UE: MyTestProject" in the BridgeStatus component.
5. On disconnect, app shows disconnected state and queues nothing — surfaces the issue to the user.

### Tool execution timeout

30 seconds default. Long-running operations (compile, large asset import) need to send heartbeat events or be redesigned to be async with a follow-up event. **For the demo, all 6 tools are fast enough that 30s is fine.** Note this for V1.

---

## 7. Tool definitions (the 6 demo tools)

Each tool needs:
- A JSON schema for Claude (in `desktop/src-tauri/src/tools.rs`)
- A Python handler (in `ue-plugin/.../tools/<name>.py`)
- Registration in `dispatcher.py`

### 7.1 `list_assets`

**Purpose:** Return a list of UAssets in the project, optionally filtered by path.

**Args schema:**
```json
{
  "type": "object",
  "properties": {
    "path_filter": {
      "type": "string",
      "description": "Optional /Game/... path prefix. Defaults to all assets.",
      "default": "/Game"
    },
    "class_filter": {
      "type": "string",
      "description": "Optional UClass name (e.g. 'Blueprint', 'Material'). Defaults to all classes."
    },
    "limit": {
      "type": "integer",
      "default": 200,
      "maximum": 1000
    }
  }
}
```

**Result:**
```json
{
  "assets": [
    { "path": "/Game/Maps/MainMap", "class": "World", "name": "MainMap" },
    ...
  ],
  "truncated": false
}
```

**Implementation note:** Use `unreal.AssetRegistryHelpers.get_asset_registry()` and filter.

### 7.2 `read_file`

**Purpose:** Read a text file from the project (C++, .uproject, config, Python). Refuses to read binary/UAsset files.

**Args:**
```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string", "description": "Project-relative path, e.g. 'Source/MyProject/MyClass.cpp'" }
  },
  "required": ["path"]
}
```

**Result:**
```json
{
  "path": "Source/MyProject/MyClass.cpp",
  "content": "...",
  "size_bytes": 1234
}
```

**Safety:**
- Reject paths containing `..`
- Reject paths outside the project root
- Reject extensions: `.uasset`, `.umap`, `.exe`, `.dll`, `.lib`, `.pdb`
- Allow: `.cpp`, `.h`, `.cs`, `.ini`, `.json`, `.py`, `.md`, `.txt`, `.uproject`, `.uplugin`

### 7.3 `write_file`

**Purpose:** Create or overwrite a text file in the project.

**Args:**
```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string" },
    "content": { "type": "string" },
    "create_dirs": { "type": "boolean", "default": true }
  },
  "required": ["path", "content"]
}
```

**Result:**
```json
{ "path": "...", "bytes_written": 1234 }
```

**Safety:** Same path rules as `read_file`. Plus: **before any write, the dispatcher invokes `git_checkpoint.ensure_checkpoint()`** which commits current state to a `myika/auto-<timestamp>` branch if a Git repo exists, or initializes one if it doesn't.

### 7.4 `run_python`

**Purpose:** Execute arbitrary Python in the editor. This is the escape hatch — most "do something in UE" tool calls go through here in the demo.

**Args:**
```json
{
  "type": "object",
  "properties": {
    "code": { "type": "string", "description": "Python source. Has access to `unreal` module." },
    "capture_output": { "type": "boolean", "default": true }
  },
  "required": ["code"]
}
```

**Result:**
```json
{
  "stdout": "...",
  "stderr": "...",
  "return_value": "..."   // string repr of the last expression value if available
}
```

**Safety considerations:**
- This tool is **dangerous by design**. It's effectively root access to the editor.
- For the demo: log every `run_python` invocation to a file `Saved/Myika/run_python_log.jsonl`.
- For V1: every `run_python` call gets a user approval prompt unless the user has enabled "trust mode" for the current session.
- **For the demo, no user approval gate** — we want the agentic flow to feel fluid. Add a setting toggle anyway, default off.

### 7.5 `get_compile_errors`

**Purpose:** Return current Blueprint and C++ compile errors.

**Args:** none.

**Result:**
```json
{
  "blueprint_errors": [
    { "asset": "/Game/BP_Door", "message": "...", "node_guid": "..." }
  ],
  "cpp_errors": [
    { "file": "Source/MyProject/MyClass.cpp", "line": 42, "message": "..." }
  ]
}
```

**Implementation:** Parse the editor's MessageLog for the Blueprint side. For C++, parse the latest `Saved/Logs/*.log` for build errors. This is fragile — accept that for the demo.

### 7.6 `read_blueprint_summary`

**Purpose:** Return a structured text summary of a Blueprint asset — what variables, functions, and event graph nodes it contains. Not the full graph (that's a V1 concern), just enough for Claude to reason about an existing BP.

**Args:**
```json
{
  "type": "object",
  "properties": {
    "asset_path": { "type": "string", "description": "e.g. '/Game/BP_Door'" }
  },
  "required": ["asset_path"]
}
```

**Result:**
```json
{
  "name": "BP_Door",
  "parent_class": "Actor",
  "components": [
    { "name": "Mesh", "class": "StaticMeshComponent" },
    { "name": "Trigger", "class": "BoxComponent" }
  ],
  "variables": [
    { "name": "bIsOpen", "type": "bool", "default": "false" }
  ],
  "functions": ["Open", "Close"],
  "events": ["BeginPlay", "OnTriggerOverlap"]
}
```

**Implementation:** Walk the BP via `unreal.EditorAssetLibrary.load_asset()` + reflection. This is the trickiest of the 6 tools. **Acceptable demo fallback:** if the BP can't be parsed cleanly, return a partial result with a `warnings` array. Don't fail the whole call.

---

## 8. The agentic flow — "build me a basic interactable door"

This is the demo's headline scenario. It needs to *work*. Test it end-to-end before considering the demo done.

### Expected user experience

1. User has UE 5.7 open with a blank or near-blank project. Myika desktop app shows "Connected."
2. User types: *"Build me a basic interactable door — when the player walks up to it and presses E, it opens."*
3. Claude responds with a short plan:
   - Create `BP_Door` inheriting from Actor
   - Add a StaticMeshComponent (use engine cube as placeholder)
   - Add a BoxComponent for trigger volume
   - Add a `bIsOpen` boolean variable
   - Implement `Open()` and `Close()` functions (rotate mesh on Z over time)
   - Wire `OnComponentBeginOverlap` to set "player in range" state
   - On input action `IA_Interact` + player-in-range, toggle door
4. User clicks **Approve & Run**.
5. Agent executes: a sequence of `run_python` calls and a `write_file` for the input action asset, with `read_blueprint_summary` and `get_compile_errors` checks between steps.
6. Agent reports: "Done. BP_Door created at /Game/Door/BP_Door. Drop it in your level and press E near it. Want me to also place one in the open level?"
7. User can drop the door in the level, hit Play, walk up, press E. It opens.

### What the agent prompt looks like

System prompt (in `desktop/src-tauri/src/claude.rs`):

> You are Myika, an AI assistant specialized in Unreal Engine 5.7. You're connected to a running editor via tools. When the user asks you to build something, propose a short plan first, wait for approval, then execute step by step. Use Python (via `run_python`) for most editor mutations — UE's Python API is your primary lever. Verify each step succeeded before moving on (`get_compile_errors`, `read_blueprint_summary`). If something fails, surface it plainly and propose a fix. Be concise. Don't lecture. Match the user's pace.

### Plan-then-execute pattern

The desktop app needs a small state machine:

1. **Idle** — accepting user input
2. **Planning** — Claude is generating; show streaming text
3. **AwaitingApproval** — Claude returned a plan with explicit `propose_plan` tool call (we add a 7th synthetic tool, see below); show PlanReview component
4. **Executing** — user approved, Claude continues with tool calls
5. **Done** — Claude returns a final message; back to Idle

**Synthetic tool for plans:** Add a `propose_plan` tool that takes `{ steps: string[], summary: string }`. Claude calls this, the desktop app intercepts it (doesn't forward to UE), shows the plan UI, and on approval responds with `{ approved: true }` so Claude continues.

This pattern is much more reliable than parsing plans out of free text.

### Run journal

For every agentic run, write a JSONL file in `<project>/Saved/Myika/runs/<timestamp>.jsonl` capturing every tool call + result. Useful for debugging and for the V1 "run review" feature.

---

## 9. UI design

**Aesthetic:** dark, terminal-influenced, premium game-dev feel. Phosphor green accent? Inter + JetBrains Mono? *(This matches Jacob's existing Myika AI brand language — confirm with him before locking, or let him supply colors.)*

**Demo screens:**

1. **Main window** — full-height chat on the left (~70% width), a slim right panel showing bridge status, current project name, settings gear icon. No sidebar nav yet.
2. **Settings modal** — API key input, model selector (Sonnet 4.6 / Opus 4.7), bridge port (default 17645), "Trust mode" toggle, theme.
3. **Plan review card** — appears inline in chat when `propose_plan` is called. Shows numbered steps, an "Approve & Run" button, an "Edit Plan" button (V1) — for the demo, just Approve and Cancel.

**Interaction polish that's worth doing even for the demo:**
- Streaming text in chat (token-by-token from Claude)
- Tool calls render as collapsible cards inline (`▶ list_assets` → expand to see args + result)
- Connection state always visible in top-right, never buried
- Error toasts that don't dismiss themselves (errors should be sticky until acknowledged)

**Polish to skip:**
- Animations beyond basic fade/slide
- Custom window chrome (use Tauri default with dark theme)
- Onboarding flow (just empty state in chat: "Connect to UE and start chatting")

---

## 10. Two-week plan

### Week 1: Bridge + foundations

**Day 1: Setup + architecture validation**
- Confirm prerequisites with user
- Scaffold `desktop/` (Tauri 2 init, React, Tailwind)
- Scaffold `ue-plugin/MyikaBridge/` with empty C++ module + `.uplugin`
- Get plugin to load in a UE 5.7 test project (just print to log on startup)
- **Deliverable:** Plugin loads in UE, desktop app builds and runs (showing "Disconnected")

**Day 2: WebSocket bridge end-to-end**
- C++ WebSocket server in plugin, listening on 17645
- Rust WebSocket client in Tauri
- Handshake works; UE emits `bridge.ready`, desktop app shows project name
- **Deliverable:** Connected status visible in app, ping/pong working

**Day 3: Python dispatcher + first tool**
- Set up Python module structure in `ue-plugin/.../Content/Python/myika/`
- Wire C++ server to forward tool requests to Python `dispatcher.dispatch(tool_name, args)`
- Implement `list_assets`
- **Deliverable:** From the desktop app's dev console, can manually send `list_assets` and see results

**Day 4: Claude integration + chat UI**
- Anthropic API client in Rust
- Settings modal for API key, persist via Tauri's secure storage
- Basic chat UI with streaming
- Tools registered with Claude, end-to-end tool call works (Claude → desktop → UE → desktop → Claude)
- **Deliverable:** User types "list the maps in my project," Claude calls `list_assets`, returns answer

**Day 5: Remaining 5 tools**
- `read_file`, `write_file` (with safe-path guard), `run_python`, `get_compile_errors`, `read_blueprint_summary`
- Git checkpoint module
- **Deliverable:** All 6 tools working individually, Claude can use them naturally in chat

**Day 6–7: Polish week-1 work, write tests for bridge protocol**
- Buffer for the things that took longer than expected
- Manual test script: "do these 10 things via chat and verify each works"

### Week 2: The killer demo

**Day 8: `propose_plan` synthetic tool + PlanReview component**
- Plan state machine in desktop app
- UI for plan review
- **Deliverable:** Claude can propose a plan, user can approve, execution continues

**Day 9–10: Door scenario, end-to-end**
- Iterate on system prompt until "build me an interactable door" reliably works on a clean test project
- This will involve a lot of `run_python` debugging — UE Python errors are often cryptic
- **Deliverable:** Door scenario works on a clean project from a single user prompt

**Day 11: Run journal + bridge status polish + error UX**
- JSONL run logging
- Sticky error toasts
- Make the "Connected to UE: ProjectName" status feel solid

**Day 12: Visual polish**
- Theme pass — colors, typography, spacing
- Tool call collapsible cards
- Final UX once-over
- **Deliverable:** Looks like a real product, not a hackathon project

**Day 13: Stretch — YouTube ingestion (planning only)**
- Add a "Paste a YouTube URL" affordance
- Pull transcript via `youtube-transcript-api` (Python sidecar or Rust crate)
- Have Claude produce a plan from the transcript
- Execution stays manual approval — same `propose_plan` flow
- **Deliverable:** Works on at least one real UE tutorial video

**Day 14: Demo recording day**
- Record the 2-minute demo video
- Update README with demo gif/video link
- Tag `v0.1.0-demo` release

---

## 11. Key decisions for the user (ask these before/during build)

These are the forks where Claude Code should pause and ask Jacob:

1. **Day 0:** UE test project — use existing or scaffold fresh blank project? (Recommend fresh.)
2. **Day 0:** Theme colors — phosphor green accent like the Myika website, or different palette for the dev tool? (Recommend match.)
3. **Day 2:** If UE's built-in WebSocket modules don't expose a server (only a client), we need to vendor a library. Confirm `cpp-httplib` (header-only, MIT) is acceptable. (Recommend yes.)
4. **Day 4:** Confirm Claude model defaults — Sonnet 4.6 for default, Opus 4.7 for "deep thinking" toggle? Or different mix?
5. **Day 5:** Is "trust mode" on by default in the demo (no approval prompt for `run_python`), off by default, or always-on? (Recommend on for demo, off for V1 default.)
6. **Day 8:** Plan UI — show plan as a numbered list, or as a checklist with per-step approval? (Recommend simple numbered list with one approve-all button for the demo.)
7. **Day 13:** If YouTube stretch happens — try frame sampling (multimodal, expensive) or transcript-only (cheaper, less reliable)? (Recommend transcript-only for the stretch; frame sampling is V1.)

---

## 12. What "demo done" means

The demo is complete when:

- [ ] Fresh-clone setup works on Windows: `git clone`, follow README, app launches and connects to a running UE 5.7 editor with the Myika plugin enabled.
- [ ] All 6 tools work via chat ("show me my assets," "what's in BP_Player," etc.).
- [ ] The door scenario works on a clean test project, end to end, in under 90 seconds of agent runtime.
- [ ] Git checkpoint is created automatically before any write.
- [ ] App reconnects gracefully if UE is restarted.
- [ ] No crashes during a 30-minute exploratory session.
- [ ] README has install instructions, screenshots, and a recorded demo link.

---

## 13. Things to defer to V1, write down so we don't forget

- Multi-conversation, conversation list sidebar
- LanceDB for project memory + semantic search over codebase
- Mission control kanban board
- Full agentic mode with dry-run, full plan editing, run review
- PBR texture pipeline (SD/Flux → albedo → derive PBR maps → import as Substrate material)
- YouTube full execution (frame sampling, multimodal)
- UE docs RAG
- Local model support (Ollama adapter)
- Approval gating for `run_python`
- Fab-ready packaging
- Crash recovery for in-flight agent runs
- Tool: `create_blueprint` (proper, not via raw `run_python`)
- Tool: `set_bp_node` for graph manipulation
- Tool: `compile_project` (full C++ build, not just hot reload)
- Tool: `import_asset`
- Tool: `query_open_level`
- Tool: `search_ue_docs`, `search_ue_source`, `search_project_memory`
- Telemetry (opt-in) so we can see which tools get used and where the agent gets stuck

---

## 14. Definitions of "stop and ask the user"

Claude Code should pause and surface a question when:

- A library choice has license implications (GPL vs MIT vs commercial)
- A decision affects the bridge protocol or tool schemas (API stability matters)
- An assumption in this doc turns out to be wrong (e.g. UE 5.7 doesn't have feature X assumed here)
- Authentication or secrets handling design is needed beyond the plain API key in this spec
- Visual design crosses from layout into branding (color, font, logo)
- A "synthetic tool" or new tool would be added to those listed in §7

Claude Code should NOT pause and ask when:

- Choosing between equally good React component patterns
- Naming internal Rust functions or modules
- Choosing test framework (just pick one — `cargo test` for Rust, `vitest` for TS, `unittest` for Python)
- Style/lint rules (set up rustfmt, prettier, black with defaults)

---

## 15. Final note from Jacob's planning conversation

Jacob is building this both as a tool to help build his own UE game *and* as an open-source product under the Myika AI umbrella ("My Intelligent Killer Assistant"). His preferred working style: trust Claude Code to figure things out, but ask sharp questions when guidance is needed. Don't over-explain UE basics. Do explain non-obvious architecture choices.

Realistic timeline expectations have been set: this is a 2-week demo, V1 is ~3 months. The "weekend with multiple agents" framing isn't realistic, and the doc above plans against truth.

End of spec.
