# Design: LLM provider abstraction

**Status:** draft, awaiting review
**Author:** 2026-04-25

## Why this design exists

SECURITY.md lists "local LLM / private routing" as the P0 unlock for studio adoption. Before writing code, this doc clarifies what we actually need to abstract — because the obvious framing ("write an `LlmProvider` trait with `AnthropicProvider`, `OllamaProvider`, …") is the wrong abstraction for how Myika is built.

## Current architecture (what reading the code reveals)

Myika is **not an LLM client**. It is:

1. **An MCP server** — `MyikaBridge` plugin in UE 5.7 hosts a WebSocket bridge and exposes tools (`paste_bp_nodes`, `connect_pins`, `read_file`, `run_python`, …) over the MCP protocol via `mcp-bridge-server.mjs`.
2. **A desktop UI shell** — Tauri app that spawns an *agent shell* as a subprocess and streams its events to the user.

The agent shell today is the **Claude Code CLI**. From `desktop/src-tauri/src/claude.rs`:

```rust
Command::new("claude")
  .arg("--print")
  .arg("--output-format").arg("stream-json")
  .arg("--model").arg(model_flag)
  .arg("--system-prompt").arg(SYSTEM_PROMPT)
  .arg("--mcp-config").arg(mcp_config_path)
  .arg("--strict-mcp-config")
  .arg("--allowedTools").arg("mcp__myika-bridge__*")
  ...
```

The CLI handles authentication, model selection, context management, tool-call orchestration, and writes stream-json events. Myika reads those events and renders them in the UI.

The implication: **Myika code already has zero direct dependency on Anthropic's API**. Provider routing happens entirely at the shell layer.

## The two real problems studios are asking us to solve

### Problem A — "Code can't go to Anthropic the company; it can go to Anthropic the model in our own cloud."

This is the more common ask. Customer wants Claude (the model) but doesn't want their data leaving their AWS/GCP perimeter. Mitigation:

- **AWS Bedrock**: Claude CLI honours `CLAUDE_CODE_USE_BEDROCK=1` + `AWS_REGION` + standard AWS credentials. Traffic flows through customer's Bedrock endpoint.
- **GCP Vertex**: Claude CLI honours `CLAUDE_CODE_USE_VERTEX=1` + `ANTHROPIC_VERTEX_PROJECT_ID` + `CLOUD_ML_REGION`. Traffic flows through customer's Vertex endpoint.
- **Anthropic with corporate proxy**: `ANTHROPIC_BASE_URL=https://corp-proxy.example.com/anthropic/` + `ANTHROPIC_AUTH_TOKEN=...`. Traffic flows through customer's auditable proxy.

**No code changes inside Myika are needed for this** — only env-var injection into the spawned `Command`. v1 is small.

### Problem B — "We can't use Anthropic at all. We need a local model."

This is the harder ask, more common in classified / regulated work. Customer wants the agent loop running entirely on-prem. Mitigation:

- A **different agent shell** that drives a local model (Ollama, llama.cpp, vLLM) and speaks MCP to Myika. The MCP server (Myika's UE plugin) doesn't change.
- Concretely: replace `Command::new("claude")` with `Command::new("myika-local-agent")` (or similar) — a binary that wraps an open-source MCP client + a local model runtime.

**This is real engineering** — the model-driven tool-call orchestration that Claude Code does for free has to be reimplemented for the local case. Most local-model setups don't speak MCP natively, and most don't have native tool-calling at all (you'd shim it via JSON-prompt-engineering). v2-or-later territory.

## Proposed abstraction

The abstraction is **`AgentShell`**, not `LlmProvider`. An agent shell:
- Takes a system prompt, an MCP config path, a user message, and a settings struct
- Spawns a subprocess (or invokes an in-process loop)
- Emits a stream of `ChatEvent`s

```rust
trait AgentShell {
    fn run(
        &self,
        prompt: &str,
        system_prompt: &str,
        mcp_config_path: &Path,
        settings: &AgentShellSettings,
        emit: &dyn Fn(ChatEvent),
    ) -> Result<String, String>;
}
```

Concrete shells we plan to ship:

| Shell                | Drives                | Talks to                            | Status         |
|----------------------|-----------------------|-------------------------------------|----------------|
| `ClaudeCodeShell`    | `claude` CLI          | Anthropic / Bedrock / Vertex / proxy| **v1 today**   |
| `LocalAgentShell`    | bundled MCP client    | Ollama / vLLM / llama.cpp           | v2             |
| `CustomCmdShell`     | user-specified binary | whatever it wants                   | v3 / escape hatch |

Settings (added to `AppSettings` in `db.rs`):

```rust
pub enum AgentShellKind { ClaudeCode, Local, CustomCmd }

pub struct AgentShellSettings {
    pub kind: AgentShellKind,
    pub claude_code: Option<ClaudeCodeRouting>,
    pub local: Option<LocalAgentSettings>,
    pub custom_cmd: Option<CustomCmdSettings>,
}

pub enum ClaudeCodeRouting {
    Anthropic { /* default */ },
    Bedrock   { aws_region: String },
    Vertex    { gcp_project: String, gcp_region: String },
    Proxy     { base_url: String, auth_token_secret_id: String },
}
```

Auth tokens are **never** stored in `AppSettings` directly — only a key into the OS secret store (Windows Credential Manager / macOS Keychain / Linux libsecret). This is the same secret-at-rest discipline applied to the bridge token in the SECURITY.md roadmap.

## v1 scope (what to actually ship next)

Scope-cut so v1 is small and reviewable:

1. Add `ClaudeCodeRouting` enum + `claude_code` field to `AppSettings`. Default = `Anthropic` (current behavior).
2. In `claude.rs::run_claude`, before spawning the CLI, set env vars based on routing:
   - `Anthropic` → no extra env (current behaviour).
   - `Bedrock` → `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION=<value>`. Trust ambient AWS credentials (the user's own SSO / IMDS / `~/.aws/credentials`).
   - `Vertex` → `CLAUDE_CODE_USE_VERTEX=1`, `ANTHROPIC_VERTEX_PROJECT_ID=<value>`, `CLOUD_ML_REGION=<value>`. Trust ambient GCP credentials (`gcloud auth application-default login`).
   - `Proxy` → `ANTHROPIC_BASE_URL=<value>`, `ANTHROPIC_AUTH_TOKEN=<resolved-from-secret-store>`.
3. Settings UI: dropdown picking the routing mode + region/project/url fields conditional on the choice.
4. Surface routing mode prominently in the UI status line (e.g. `Claude • Bedrock us-east-1`) so users can't accidentally exfiltrate to Anthropic when they meant to stay in Bedrock.
5. Document each routing mode's outbound endpoints in SECURITY.md so security review has one place to check.

**v1 explicitly does NOT include:**
- A local-agent shell. Defer to v2.
- A `CustomCmd` shell. Defer to v3 (it's the escape hatch — implement when someone asks).
- Streaming-event-format adapters. The Claude CLI's stream-json format is the one we read; v2 shells will have to emit the same shape.

## Open design questions (worth a discussion)

1. **Where does the secret store live?** Windows DPAPI is right for individual users, but doesn't survive machine migration. For studio admins who provision dev machines, a `secrets.json` next to the policy file (gitignored) would be more deployable. Probably want to support both, with the secret store as default.

2. **Should the system prompt change per provider?** The current `SYSTEM_PROMPT` (in `claude.rs`) is Claude-specific in tone and assumes Claude's tool-use protocol. For local models with weaker instruction-following, the prompt may need rephrasing. Probably store per-shell variants.

3. **Streaming-format compatibility.** v2 local shells will need to emit a stream that `claude.rs` can parse. Either we adopt Claude CLI's stream-json verbatim as the inter-process format, or we define a Myika-internal format and have each shell adapt. The first is cheaper; the second is more honest. Lean toward the first for v1/v2, define our own only when a shell can't fit.

4. **Tool-call shimming for local models.** Most local models don't speak Claude's `tool_use` blocks natively. The `LocalAgentShell` will have to prompt-engineer JSON tool calls + parse them out. That logic is non-trivial and will need its own iteration. Don't try to write it in the same PR as the shell trait.

5. **What does "model" mean across shells?** Today `settings.model` is `"opus"` or `"sonnet"`. For Bedrock it would be a Bedrock model ID. For local it's an Ollama tag. Either widen the field to a free-form string per shell, or namespace it (`{shell: "claude-code", model: "opus"}` / `{shell: "local", model: "ollama:llama3.1:70b"}`).

## Suggested next step

Start with **v1, point 2** alone — env-var injection in `claude.rs` for an existing `claude_code` settings field, default `Anthropic`. That's a 30-line PR with no UI work, no DB migrations, and immediately unblocks studios who already have Bedrock or a corporate proxy. Then iterate on the settings UI and the rest of v1 once that's landed.

The schema/UI work and the local-agent shell are bigger; do them after the env-var passthrough is live and we have at least one studio actually using Bedrock end-to-end.
