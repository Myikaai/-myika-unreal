use crate::db::{AppSettings, Db};
use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SYSTEM_PROMPT: &str = r#"You are Myika, an AI assistant specialized in Unreal Engine 5.7. You're connected to a running UE editor via tools.

When the user asks you to build something, propose a short plan first, then execute step by step. Use Python (via run_python) for most editor mutations — UE's Python API is your primary lever. Verify each step succeeded before moving on (get_compile_errors, read_blueprint_summary). If something fails, surface it plainly and propose a fix.

Be concise. Don't lecture. Match the user's pace.

You have access to these tools via MCP:
- list_assets: List UAssets in the project
- read_file: Read text files from the project
- write_file: Create/overwrite text files (auto git checkpoint)
- run_python: Execute Python in the UE editor (has 'unreal' module)
- get_compile_errors: Get Blueprint and C++ compile errors
- read_blueprint_summary: Get structured Blueprint summary"#;

const MAX_TURNS: u32 = 25;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatEvent {
    /// Streaming text chunk from the assistant
    AssistantText { text: String },
    /// Assistant finished responding
    AssistantDone { full_text: String },
    /// A tool was called
    ToolCall { name: String, args: String },
    /// Tool result came back
    ToolResult { name: String, result: String },
    /// Error occurred
    Error { message: String },
}

pub struct ChatState {
    pub history: std::sync::Mutex<Vec<(String, String)>>,
    pub is_running: AtomicBool,
}

impl ChatState {
    pub fn new() -> Self {
        Self {
            history: std::sync::Mutex::new(Vec::new()),
            is_running: AtomicBool::new(false),
        }
    }
}

/// Build the conversation context from history for the prompt
fn build_prompt(history: &[(String, String)], new_message: &str) -> String {
    if history.is_empty() {
        return new_message.to_string();
    }

    let mut prompt = String::from("Previous conversation:\n\n");
    for (role, content) in history {
        match role.as_str() {
            "user" => prompt.push_str(&format!("User: {}\n\n", content)),
            "assistant" => prompt.push_str(&format!("Assistant: {}\n\n", content)),
            _ => {}
        }
    }
    prompt.push_str(&format!("User: {}", new_message));
    prompt
}

/// Send a message to Claude CLI on a dedicated OS thread.
/// Returns immediately — results arrive via Tauri events.
pub fn send_message_blocking(
    app: AppHandle,
    message: String,
    settings: AppSettings,
    chat_state: Arc<ChatState>,
    db: Arc<Db>,
    mcp_config_path: PathBuf,
) {
    // Check if already running
    if chat_state.is_running.swap(true, Ordering::SeqCst) {
        let _ = app.emit("chat-event", ChatEvent::Error {
            message: "A message is already being processed".to_string(),
        });
        return;
    }

    // Save user message
    let _ = db.save_message("user", &message, None, None, None);

    // Build prompt with history
    let history = chat_state.history.lock().unwrap().clone();
    let prompt = build_prompt(&history, &message);

    // Add to history
    chat_state.history.lock().unwrap().push(("user".to_string(), message.clone()));

    // Spawn a plain OS thread — completely off the tokio runtime
    std::thread::spawn(move || {
        log::info!("Claude worker thread started");
        let result = run_claude(&app, &prompt, &settings, &mcp_config_path);

        match result {
            Ok(full_response) => {
                if !full_response.is_empty() {
                    let _ = db.save_message("assistant", &full_response, None, None, None);
                    chat_state.history.lock().unwrap().push(("assistant".to_string(), full_response.clone()));
                }
                let _ = app.emit("chat-event", ChatEvent::AssistantDone {
                    full_text: full_response,
                });
            }
            Err(e) => {
                log::error!("Chat error: {}", e);
                let _ = app.emit("chat-event", ChatEvent::Error { message: e });
            }
        }

        chat_state.is_running.store(false, Ordering::SeqCst);
    });
}

/// Run the claude CLI process with blocking I/O. Returns the full response text.
fn run_claude(
    app: &AppHandle,
    prompt: &str,
    settings: &AppSettings,
    mcp_config_path: &PathBuf,
) -> Result<String, String> {
    let model_flag = match settings.model.as_str() {
        "opus" => "opus",
        _ => "sonnet",
    };

    let mut cmd = Command::new("claude");
    cmd.arg("--print")
        .arg("--verbose")
        .arg("--output-format").arg("stream-json")
        .arg("--model").arg(model_flag)
        .arg("--system-prompt").arg(SYSTEM_PROMPT)
        .arg("--mcp-config").arg(mcp_config_path)
        .arg("--strict-mcp-config")
        .arg("--tools").arg("")  // disable all built-in tools — only MCP UE tools
        .arg("--allowedTools").arg("mcp__myika-bridge__*")  // auto-approve all our MCP tools
        .arg("--no-session-persistence")
        .arg("--max-turns").arg(MAX_TURNS.to_string())
        .arg("--permission-mode").arg("bypassPermissions")
        .arg("--")
        .arg(prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Some(parent) = mcp_config_path.parent() {
        cmd.current_dir(parent);
    }

    log::info!("Spawning claude CLI with model={}", model_flag);

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude: {}", e))?;
    log::info!("Claude process spawned, pid={:?}", child.id());

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // Drain stderr on a separate thread to prevent pipe deadlock
    let stderr_thread = std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        let mut output = String::new();
        for line in reader.lines() {
            if let Ok(line) = line {
                output.push_str(&line);
                output.push('\n');
            }
        }
        output
    });

    // Read stdout line-by-line (blocking) and emit events
    let reader = std::io::BufReader::new(stdout);
    let mut full_response = String::new();
    let mut emitted_len: usize = 0; // track how much text we've already sent to the frontend

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let event: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

        log::info!("Claude stream event type: {}", event_type);

        match event_type {
            "assistant" => {
                if let Some(message) = event.get("message") {
                    if let Some(content) = message.get("content") {
                        if let Some(arr) = content.as_array() {
                            // Rebuild full text from all text blocks in this event
                            let mut event_text = String::new();
                            for block in arr {
                                let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                match block_type {
                                    "text" => {
                                        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                                            event_text.push_str(text);
                                        }
                                    }
                                    "tool_use" => {
                                        let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                                        let args = block.get("input").map(|v| v.to_string()).unwrap_or_default();
                                        let _ = app.emit("chat-event", ChatEvent::ToolCall {
                                            name: name.to_string(),
                                            args,
                                        });
                                    }
                                    "thinking" => {
                                        log::debug!("Claude thinking block (skipped)");
                                    }
                                    _ => {
                                        log::debug!("Unknown content block type: {}", block_type);
                                    }
                                }
                            }

                            // Only emit the NEW text we haven't sent yet (delta)
                            if event_text.len() > emitted_len {
                                let delta = &event_text[emitted_len..];
                                let _ = app.emit("chat-event", ChatEvent::AssistantText {
                                    text: delta.to_string(),
                                });
                                emitted_len = event_text.len();
                            }
                            full_response = event_text;
                        }
                    }
                }
            }
            "result" => {
                if let Some(result_text) = event.get("result").and_then(|v| v.as_str()) {
                    if full_response.is_empty() {
                        full_response = result_text.to_string();
                        let _ = app.emit("chat-event", ChatEvent::AssistantText {
                            text: result_text.to_string(),
                        });
                    }
                }
            }
            _ => {
                log::debug!("Claude stream event: {}", event_type);
            }
        }
    }

    log::info!("Claude stdout stream ended, waiting for process to exit");
    let status = child.wait().map_err(|e| format!("Claude process error: {}", e))?;
    log::info!("Claude process exited with status: {}", status);
    let stderr_output = stderr_thread.join().unwrap_or_default();
    if !stderr_output.is_empty() {
        log::info!("Claude stderr length: {} bytes", stderr_output.len());
    }

    if !status.success() {
        log::warn!("Claude exited with status: {}", status);
        if !stderr_output.is_empty() {
            log::error!("Claude stderr: {}", stderr_output);
        }
        if full_response.is_empty() {
            let err_msg = if stderr_output.is_empty() {
                format!("Claude exited with {}", status)
            } else {
                stderr_output.trim().to_string()
            };
            return Err(err_msg);
        }
    }

    Ok(full_response)
}
