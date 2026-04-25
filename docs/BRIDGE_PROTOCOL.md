# Bridge Protocol

WebSocket on `ws://127.0.0.1:17645`. JSON messages, one per frame.

## Message envelope

```json
{
  "id": "uuid-v4",
  "type": "request" | "response" | "event",
  "payload": { ... }
}
```

## Request (desktop → UE)

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

## Response (UE → desktop)

```json
{
  "id": "abc-123",
  "type": "response",
  "payload": {
    "ok": true,
    "result": { ... }
  }
}
```

## Error response

```json
{
  "id": "abc-123",
  "type": "response",
  "payload": {
    "ok": false,
    "error": {
      "code": "TOOL_NOT_FOUND | EXEC_ERROR | TIMEOUT | INVALID_ARGS",
      "message": "Human-readable description"
    }
  }
}
```

## Events (UE → desktop, unsolicited)

- `bridge.ready` — sent on connection, includes `ueVersion` and `projectName`
- `bridge.shutdown` — sent before UE closes

## Timeout

30 seconds default. All demo tools are fast enough.
