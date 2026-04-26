# Roadmap

A high-level view of where Myika Unreal is going. No dates — direction over deadlines.

## Now

- Bridge protocol and core tool surface (`list_assets`, `read_file`, `write_file`, `run_python`, `get_compile_errors`, `read_blueprint_summary`)
- Programmatic Blueprint graph construction (`paste_bp_nodes`, `connect_pins`)
- Auto Git checkpoint before writes
- Single-conversation chat with streaming and inline tool-call rendering

## Next

- Multi-conversation history and project-scoped chat threads
- Project memory: vector index over the codebase for grounded answers
- Mission control board for running and tracking agent tasks
- Expanded Blueprint tooling: pin defaults, timeline tracks, full graph round-trip
- Approval gating for privileged tools (`run_python`, writes outside a configured scope)

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
