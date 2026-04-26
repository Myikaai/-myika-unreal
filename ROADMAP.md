# Roadmap

A high-level view of where Myika Unreal is going. No dates — direction over deadlines.

## Now

- Bridge protocol and core tool surface (`list_assets`, `read_file`, `write_file`, `run_python`, `get_compile_errors`, `read_blueprint_summary`)
- Programmatic Blueprint graph construction (`paste_bp_nodes`, `connect_pins`, `set_pin_default`, `add_timeline_track`, `create_timeline`, `list_node_pins`)
- Material graph construction (`create_material`, `add_material_expression`, `connect_material_expressions`, `connect_material_property`)
- High-level skill wrappers (e.g. `make_blinking_neon_material`) that collapse multi-step recipes into a single tool call so the agent doesn't orchestrate ten-plus primitives for well-known targets
- Zero-config tool discovery — drop a `*.py` into `myika/tools/` with `TOOL_NAME` + `handle()` and it's live on first call (auto-rescan on `TOOL_NOT_FOUND`, default policy auto-allows)
- Auto Git checkpoint before writes
- Single-conversation chat with streaming, inline tool-call rendering, plan-review UI

## Next

- C++-orchestrator skill pattern so high-level wrappers (`make_pulsing_light_actor`, etc.) can compose C++ tools in one call — currently Python tool handlers can't synchronously invoke C++ handlers, so BP+Timeline skills live as procedural recipes under `docs/SKILLS/` instead
- MCP tool list auto-fetched from the live bridge registry, so adding a tool no longer needs an `mcp-bridge-server.mjs` edit either
- Multi-conversation history and project-scoped chat threads
- Project memory: vector index over the codebase for grounded answers
- Mission control board for running and tracking agent tasks
- Approval gating for privileged tools (`run_python`, writes outside a configured scope)
- C++ tool gate consulting `policy.json` (currently only Python tools route through the policy layer)

## Later

- Local LLM routing (Ollama, llama.cpp, self-hosted endpoints) for studios that can't send code to third-party APIs
- Encrypted bridge-token storage via platform secret stores
- Texture pipeline (generation → PBR map derivation → Substrate import)
- UE documentation RAG and source-search tools
- YouTube tutorial ingestion (transcript → plan → optional execution)
- Fab-ready packaging
- Cross-platform support beyond Windows

## Interested in shaping this?

Open an issue describing the workflow you wish existed. The roadmap moves toward the real problems people show up with.
