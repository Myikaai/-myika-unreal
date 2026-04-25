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

IMPORTANT: When a request involves 2 or more steps, structural changes, or multi-file operations, you MUST call propose_plan first with a summary and numbered steps. Wait for the user's approval before executing. If the plan is cancelled, acknowledge it and stop — do not execute any steps. Simple single-step tasks (e.g. creating one file, reading a file) can be executed directly without a plan.

Use Python (via run_python) for most editor mutations — UE's Python API is your primary lever. Verify each step succeeded before moving on (get_compile_errors, read_blueprint_summary). If something fails, surface it plainly and propose a fix.

Be concise. Don't lecture. Match the user's pace.

## Tools (MCP)
- propose_plan: Propose a multi-step plan for user approval before executing
- list_assets: List UAssets in the project
- read_file: Read text files from the project
- write_file: Create/overwrite text files (auto git checkpoint)
- run_python: Execute Python in the UE editor (has 'unreal' module)
- get_compile_errors: Get Blueprint and C++ compile errors
- read_blueprint_summary: Get structured Blueprint summary

## Myika Primitives Library
The MyikaBridge plugin ships reusable C++ components optimized for AI assembly. Compose these into Blueprints via run_python rather than trying to build everything from raw UE classes. These components handle the parts that are hard to do via Python (event wiring, input binding, animation) — your job is to create BPs, add these components, and configure their properties.

### UMyikaInteractionComponent
Detects player overlap + responds to an Enhanced Input action. Optionally handles door-style rotation animation entirely through properties.

Add to any Actor Blueprint via run_python:
  import unreal
  # After creating the BP and getting its SCS (SimpleConstructionScript):
  interaction_node = scs.create_node(unreal.MyikaInteractionComponent, "InteractionComponent")
  interaction_comp = interaction_node.component_template
  interaction_comp.set_editor_property("InteractionExtent", unreal.Vector(150, 150, 150))
  interaction_comp.set_editor_property("bAutoRotate", True)
  interaction_comp.set_editor_property("RotationAngle", 90.0)
  interaction_comp.set_editor_property("RotationDuration", 0.5)
  # Set the input action:
  ia = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IA_Interact")
  interaction_comp.set_editor_property("InputAction", ia)

Properties:
- InteractionExtent (FVector): Half-extent of overlap detection box. Default (150, 150, 150).
- InputAction (UInputAction*): Enhanced Input action to listen for. Use /MyikaBridge/Input/IA_Interact.
- bAutoRotate (bool): If true, component handles rotation animation on interaction. Default false.
- RotationAxis (EAxis): Axis to rotate around (X/Y/Z). Default Z.
- RotationAngle (float): Degrees to rotate when opening. Default 90.
- RotationDuration (float): Seconds for open/close animation. Default 0.5.
- bIsOpen (bool): Current open/close state (read-only).

Delegates (BlueprintAssignable):
- OnInteract(AActor* Interactor): Fired when player presses action while in range.
- OnDoorStateChanged(bool bOpening): Fired when auto-rotate starts.

### Enhanced Input Assets
- /MyikaBridge/Input/IA_Interact: InputAction for player interaction (E key)
- /MyikaBridge/Input/IMC_Myika: InputMappingContext mapping E key to IA_Interact

IMPORTANT: When creating a BP that uses UMyikaInteractionComponent, also ensure the player controller has IMC_Myika added. Do this via run_python as a setup step:
  import unreal
  world = unreal.EditorLevelLibrary.get_editor_world()
  pc = unreal.GameplayStatics.get_player_controller(world, 0)
  if pc:
      subsystem = unreal.SubsystemBlueprintLibrary.get_local_player_subsystem(
          unreal.EnhancedInputLocalPlayerSubsystem, pc)
      if subsystem:
          imc = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IMC_Myika")
          subsystem.add_mapping_context(imc, 0)
This IMC setup only needs to happen once per play session.

## Meta-pattern: Asset Creation
When a feature would require manual asset creation (Input Actions, Materials, Data Tables, etc.), prefer run_python with the appropriate UE Python API call. The UE Python API supports creating most asset types programmatically via unreal.AssetToolsHelpers.get_asset_tools().create_asset(). Manual user steps are a last resort — only fall back to them if you hit a genuine Python API limitation, and surface the limitation explicitly so we can evaluate alternatives."#;

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
    /// A plan was proposed and needs user approval
    PlanProposed { steps: Vec<String>, summary: String },
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
        // TODO(V1): run_python should require user approval unless "trust mode" is on.
        // For the demo, all MCP tools are auto-approved for fluid agentic flow.
        .arg("--allowedTools").arg("mcp__myika-bridge__*")
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

                            // New turn detected — reset delta tracking
                            if event_text.len() < emitted_len {
                                emitted_len = 0;
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
