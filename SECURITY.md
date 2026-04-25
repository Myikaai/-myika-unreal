# Security

This document describes Myika's threat model, the protections that are in place today, and a roadmap of hardening work for individuals and studios who don't want their project files to leak.

## Reporting a vulnerability

Please open a private security advisory on GitHub or email the maintainer directly. Do not file public issues for vulnerabilities.

## Threat model

Myika is an AI-driven editor automation that runs alongside Unreal Engine. It has three architectural surfaces, each with its own risks:

1. **The local WebSocket bridge** — UE plugin exposes `ws://127.0.0.1:17645` so the desktop app can call tools (read files, edit blueprints, run Python in the editor). Any process on the same machine could attempt to connect.
2. **The LLM provider integration** — when an agent runs, file contents and tool outputs are sent to a model API. By default that's Anthropic; it may be a self-hosted endpoint.
3. **The local repo and disk surface** — auto-memory, logs, snippets, screenshots, and temporary files written under the user's profile.

The realistic threats we design for:

- **Outbound exfiltration via the LLM.** Proprietary code or assets reach a third-party SaaS as part of agent context, even when no-training headers are honoured. Studios with legal review will treat any third-party data flow as a blocker.
- **Local lateral attacker.** Malware running as the same user reads the bridge token from disk and connects to the bridge, gaining the ability to call tools that write files or execute Python in the editor process.
- **Casual oversharing.** Logs, crash dumps, telemetry, screenshots, and shared snippets accidentally include source code, paths, or secrets.
- **Repo accidents.** `.env`, credentials, or unreleased asset paths committed to a public repo or template.
- **Insider replay.** A captured agent session is reused outside its original authorization scope.

Out of scope: physical access to an unlocked workstation; hostile UE plugins installed by the user themselves; supply-chain compromise of pinned upstream dependencies (mitigated separately via Renovate/Dependabot).

## Protections in place today

- **Bridge auth.** The bridge requires an `X-Myika-Token` header on the WebSocket upgrade request. Token is 64 hex chars, generated in the editor on first launch, stored at `%LOCALAPPDATA%\Myika\bridge-token`. Connections from any other process are rejected at handshake. Single-client only — a connected desktop holds the slot until disconnect.
- **Localhost-only listener.** Bridge binds to `127.0.0.1` — never exposed off-machine.
- **Path containment in file tools.** `read_file` and `write_file` reject `..` traversal and any path that resolves outside the project directory.
- **Extension allowlist for file tools.** Only text/source extensions are readable or writable (`.cpp`, `.h`, `.cs`, `.ini`, `.json`, `.py`, `.md`, `.txt`, `.uproject`, `.uplugin`). Binary asset extensions (`.uasset`, `.umap`, `.exe`, `.dll`, `.lib`, `.pdb`) are explicitly blocked from reads.
- **Secret-name denylist** *(`util/secret_filter.py`)*. Even when a basename's extension is on the allowlist, file tools refuse to touch names matching `.env*` (except `.env.example`/`.sample`/`.template`), `secrets.*`, `credentials.*`, `service-account*.json`, `*-credentials.json`, `id_rsa*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, etc.
- **Secret-content scanner** *(`util/secret_filter.py`)*. On read and on write, content is scanned for high-confidence secret markers: PEM private-key headers, AWS access-key IDs, Slack tokens, GitHub PATs, JWTs, Anthropic/OpenAI `sk-`-prefix keys, Google API keys. Matches are refused with a labeled error.
- **Defensive `.gitignore`.** Both repo trees gitignore `.env`, `.env.*` (allowing `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `secrets.json`, `credentials.json`, `service-account*.json`, `*-credentials.json`, plus build artifacts and Python `__pycache__/`.
- **Tool-surface policy** *(`util/policy.py`, gated in `dispatcher.py`)*. A project-local `.myika/policy.json` declares which Python tools may run and which project-relative paths each path-taking tool may touch. Three predefined profiles ship: `default` (current open behavior — all tools, no path restrictions), `safe-mode` (disables `run_python`; clamps `read_file`/`write_file` to `Source/`, `Plugins/`, `Config/`, `Content/Python/`, `docs/`, plus root-level text/manifest files), and `strict` (read-only — no `write_file`, no graph mutators, narrow read paths). A studio's minimum config is `{"profile": "safe-mode"}`. Malformed or unknown-profile policy files fail closed to `strict`. The C++ tool dispatcher (`paste_bp_nodes`, `connect_pins`, etc.) needs its own gate reading the same policy file — see roadmap.
- **No public secrets.** Auditing of the public `myika-unreal` tree shows zero tracked secret-shaped files, zero hardcoded usernames, zero hardcoded absolute paths.

## Hardening roadmap

Items below are ordered by impact for "make this acceptable to a studio's security review."

### P0 — required for company use

- **Provider routing & local-LLM support.** See `docs/DESIGN/llm-provider-abstraction.md` for the full design. Summary: Myika spawns Claude Code CLI as the agent shell, so the abstraction is over *agent shells*, not LLM clients. v1 ships env-var passthrough for Bedrock/Vertex/corporate-proxy routing of Claude (small PR — no Myika code changes the LLM, just configures the spawned CLI). v2 ships an alternative agent shell that drives a local model (Ollama / vLLM) over MCP for fully on-prem operation.
- **Encrypt bridge token at rest.** Wrap `bridge-token` with platform secret stores: Windows DPAPI (`CryptProtectData`, user scope), macOS Keychain, Linux libsecret. The on-disk file becomes useless on a different account or different machine.
- **C++ tool gate.** The Python tool dispatcher now respects `.myika/policy.json` (see "Protections in place"), but C++ handlers (`paste_bp_nodes`, `connect_pins`, the upcoming `set_pin_default` / `add_timeline_track` / `read_bp_graph`) route through a separate dispatcher in `MyikaBridgeServer.cpp` that doesn't yet consult the policy. Add a parallel C++ loader for `policy.json` and gate at the C++ entry point so safe-mode genuinely covers the full surface.

### P1 — should-have

- **Audit log of agent actions.** Append-only `.myika/audit.log` capturing every tool call: file path, content hash, timestamp, model. Local-only by default; gives security teams a forensic trail.
- **Telemetry profiles.** Two modes — `default` (anonymized usage events, opt-out) and `enterprise` (zero outbound except the chosen LLM endpoint, no crash uploads, no auto-update pings). Document every endpoint hit in each mode.
- **Origin-checked WebSocket handshake.** Beyond the token, verify the connecting process matches the registered desktop client (PID lineage / per-launch signed nonce). Rotate the token on every editor restart instead of persisting.

### P2 — nice-to-have

- **Snippet-share fingerprint guard.** If a user shares a T3D snippet through the app, hash-match against project source paths and prompt before upload.
- **Project-local memory mode.** Optional per-project memory under `.myika/memory/` (gitignored by default) so memory travels with the project, not the user account. Useful when one machine touches multiple unrelated projects.
- **Air-gapped install docs.** Documented procedure for fully offline operation: bundled binaries, pinned local model, no auto-update, no telemetry, no remote endpoints.

### P3 — long-tail

- **Signed releases and SBOM.** GitHub Actions producing signed Tauri binaries with attestations and a CycloneDX SBOM.
- **Per-tool consent UX.** First time the agent calls `write_file` (or any privileged tool) in a session, prompt the user. Cache consent per session, not forever.

## Configuring `.myika/policy.json`

Create `.myika/policy.json` at the project root. Minimum config:

```json
{ "profile": "safe-mode" }
```

Override individual fields when needed — anything you specify replaces the base profile's value for that key:

```json
{
  "profile": "safe-mode",
  "enabled_tools": ["list_assets", "read_file", "get_compile_errors", "read_blueprint_summary"],
  "path_allowlist": {
    "read_file":  ["Source/MyGame/**", "Config/**", "*.uproject"]
  }
}
```

Profiles:

| Profile     | `run_python` | `write_file` | Graph mutators | Path restrictions          |
|-------------|--------------|--------------|----------------|----------------------------|
| `default`   | yes          | yes          | yes            | none (open)                |
| `safe-mode` | **no**       | yes          | yes            | source/config dirs only    |
| `strict`    | **no**       | **no**       | **no**         | source/config (read-only)  |

Failure modes:
- Missing `policy.json` → falls through to `default`
- Malformed JSON → fails closed to `strict` (logged to UE log)
- Unknown profile name → fails closed to `strict`

## What you can do today as a user

- **Don't put real secrets in your project tree.** Use `.env` for local development and rely on the secret-name denylist + gitignore.
- **Review your `.gitignore` before adding a remote.** Ensure `.env`, `*.pem`, `*.key`, `secrets.*`, `credentials.*` are ignored.
- **Rotate your bridge token if you suspect compromise.** Delete `%LOCALAPPDATA%\Myika\bridge-token` and restart UE — the plugin regenerates on next start.
- **Treat the auto-memory directory like a developer notebook.** It lives at `~/.claude/projects/.../memory/` and may contain project context. If your machine sends that directory to OneDrive/iCloud/Dropbox, decide whether that backup posture is acceptable for your project.
- **Use `enterprise` mode** (when available) for projects under NDA or studio policy.
