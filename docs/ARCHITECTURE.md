# Architecture

See MYIKA_UNREAL_DEMO_SPEC.md for full details.

## High-level

- **Desktop app** (Tauri 2 + React): Chat UI, Claude API client, SQLite persistence
- **UE plugin** (C++ + Python): WebSocket server, tool handlers via Python
- **Bridge**: WebSocket on `ws://127.0.0.1:17645`, JSON messages

## Data flow

1. User sends message in desktop app
2. App calls Claude API with tool definitions
3. Claude requests tool call → app forwards via WebSocket to UE plugin
4. Plugin executes via Python, returns result
5. App feeds result back to Claude
6. Loop until Claude returns final message
