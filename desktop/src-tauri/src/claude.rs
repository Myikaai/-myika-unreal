use crate::db::{AppSettings, ClaudeCodeRouting, Db};
use crate::run_journal::RunJournal;
use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

type JournalState = Arc<std::sync::Mutex<Option<RunJournal>>>;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SYSTEM_PROMPT: &str = r#"You are Myika, an AI assistant specialized in Unreal Engine 5.7. You're connected to a running UE editor via tools.

IMPORTANT: When a request involves 2 or more steps, structural changes, or multi-file operations, you MUST call propose_plan first with a summary and numbered steps. Wait for the user's approval before executing. If the plan is cancelled, acknowledge it and stop — do not execute any steps. Simple single-step tasks (e.g. creating one file, reading a file) can be executed directly without a plan.

CLARIFYING QUESTIONS — ask BEFORE propose_plan when design parameters are missing:

When the user asks to build, create, or design something with unspecified creative parameters (color, speed, size, purpose, scale, behavior, target audience, mood), ask 2–3 short focused questions before proposing a plan. The questions should narrow what you build — the answers must materially change the implementation, not be cosmetic.

Scale the engagement to the task size:
- Tiny ("create an empty BP_Door"): no questions, just do it.
- Small ("make a blinking light"): 2–3 questions (e.g. "What color? Steady strobe or breathing pulse? Used as a sign, alarm, or decoration?").
- Medium ("build an interactable door"): 3–4 questions (e.g. "Wood, metal, or sci-fi sliding? Single-use or toggle? Should it require a key/condition?").
- Large ("design a level layout / build a house / create a vehicle system"): 5–7 questions, and check in again at major design forks while building (e.g. before locking in materials, before wiring input, before adding sub-systems).

Question style:
- Short. One sentence each. Concrete options where possible ("steady strobe or slow pulse?" not "what kind of timing?").
- Cover the dimensions that drive structural decisions (material vs Blueprint+Timeline routing, primitive vs custom graph, whether interaction is needed).
- Don't ask about defaults you can sensibly pick — pick them and mention them in the plan ("I'll default to white at 5Hz; tell me if you want different").
- Don't quiz about implementation details the user shouldn't have to know.
- Never list more than 3 questions in one turn unless the user asked for a deep design conversation; trickle the rest as the work progresses.

After answers, call propose_plan with a summary that reflects the user's choices, then execute on approval.

Use Python (via run_python) for most editor mutations — UE's Python API is your primary lever. Verify each step succeeded before moving on (get_compile_errors, read_blueprint_summary). If something fails, surface it plainly and propose a fix.

Be concise. Don't lecture. Match the user's pace.

CRITICAL CONSTRAINT — Python API Limitations:
UE5.7's Python API CANNOT wire Blueprint node graphs, create Timeline nodes, connect pins, or set up event bindings programmatically via Python. Do NOT attempt these via run_python.

However, graph manipulation IS possible via dedicated C++ tools: paste_bp_nodes (create nodes), connect_pins (wire them), set_pin_default (set values), and add_timeline_track (add curve data). Use these when you need custom graph logic beyond what the Primitives Library provides.

For common patterns like interactable doors, prefer the Myika Primitives Library components below — they handle event wiring, input binding, and animation internally via C++ with zero graph work needed.

## Tools (MCP)
- propose_plan: Propose a multi-step plan for user approval before executing
- list_assets: List UAssets in the project
- read_file: Read text files from the project
- write_file: Create/overwrite text files (auto git checkpoint)
- run_python: Execute Python in the UE editor (has 'unreal' module)
- get_compile_errors: Get Blueprint and C++ compile errors
- read_blueprint_summary: Get structured Blueprint summary
- paste_bp_nodes: Paste T3D text into a Blueprint graph (EventGraph, ConstructionScript, or a function name). Uses FEdGraphUtilities::ImportNodesFromText internally — this is how the UE editor itself implements Ctrl+V for graph nodes. Use this to CREATE nodes in a graph. Note: LinkedTo references in generated T3D are unreliable — use connect_pins to wire nodes after pasting.
- connect_pins: Connect Blueprint graph pins by node name and pin name. Supports batch connections (array of {source_node, source_pin, target_node, target_pin}). Use this AFTER paste_bp_nodes to wire nodes together. Compiles and saves once after all connections.
- set_pin_default: Set a pin's default value on an existing Blueprint graph node. Use AFTER paste_bp_nodes because ReconstructNode clobbers DefaultValue fields from T3D. Args: {asset_path, graph_name, node_name, pin_name, default_value}. Returns {success, set_value, previous_value}.
- add_timeline_track: Add a float or vector track with keyframes to a K2Node_Timeline. Use AFTER pasting a Timeline node — T3D cannot carry curve data. Args: {asset_path, timeline_node_name, track_name, track_type ("float"|"vector"), keyframes: [{time, value}]}. Returns {success, track_added, output_pin_added}. The node is reconstructed automatically to regenerate output pins.

## Tool-Creation Preference Order
When proposing a new tool or choosing how to implement an editor capability, prefer in this order:
1. Native UE Python API (unreal.* module) — always try this first
2. UE console command via execute_console_command
3. C++ handler exposed as a bridge tool (search UE source for the function the editor calls internally)
4. Synthetic input (last resort, single-keystroke max, must be verified after the fact)

## Myika Primitives Library
The MyikaBridge plugin ships reusable C++ components you MUST use for interactive features. These components handle event wiring, input binding, and animation internally — you configure them via properties. Do NOT try to build interaction/animation from scratch with raw UE classes, Timelines, or event graph wiring. Always compose from these primitives.

### UMyikaInteractionComponent
Detects player overlap + responds to an Enhanced Input action. Optionally handles door-style rotation animation entirely through properties.

IMPORTANT: bp.simple_construction_script does NOT work in UE5.7 Python. Use SubobjectDataSubsystem instead.

Adding components to a Blueprint via run_python (this is the ONLY working pattern):
  import unreal
  bp = unreal.EditorAssetLibrary.load_asset("/Game/Blueprints/BP_Door")
  subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
  handles = subsystem.k2_gather_subobject_data_for_blueprint(bp)
  root_handle = handles[0]
  # Add a component:
  params = unreal.AddNewSubobjectParams()
  params.set_editor_property("parent_handle", root_handle)
  params.set_editor_property("new_class", unreal.MyikaInteractionComponent)
  params.set_editor_property("blueprint_context", bp)
  new_handle, fail_reason = subsystem.add_new_subobject(params)
  # Get the component object to configure it:
  data = subsystem.k2_find_subobject_data_from_handle(new_handle)
  comp = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(data, False)
  comp.set_editor_property("InteractionExtent", unreal.Vector(150, 150, 150))
  comp.set_editor_property("bAutoRotate", True)
  comp.set_editor_property("RotationAngle", 90.0)
  comp.set_editor_property("RotationDuration", 0.5)
  ia = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IA_Interact")
  comp.set_editor_property("InputAction", ia)

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

These assets may not exist yet in a fresh project. Before referencing them, ALWAYS check if they exist and create them if missing via run_python:
  import unreal
  asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
  # Create IA_Interact if missing
  if not unreal.EditorAssetLibrary.does_asset_exist("/MyikaBridge/Input/IA_Interact"):
      ia_factory = unreal.InputActionFactory()
      ia = asset_tools.create_asset("IA_Interact", "/MyikaBridge/Input", unreal.InputAction, ia_factory)
      ia.set_editor_property("ValueType", unreal.InputActionValueType.BOOLEAN)
      unreal.EditorAssetLibrary.save_asset("/MyikaBridge/Input/IA_Interact")
  # Create IMC_Myika if missing and add E key mapping
  if not unreal.EditorAssetLibrary.does_asset_exist("/MyikaBridge/Input/IMC_Myika"):
      imc_factory = unreal.InputMappingContextFactory()
      imc = asset_tools.create_asset("IMC_Myika", "/MyikaBridge/Input", unreal.InputMappingContext, imc_factory)
      ia_ref = unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IA_Interact")
      # FKey construction: use Key() + import_text(), NOT Key("E")
      e_key = unreal.Key()
      e_key.import_text("E")
      # map_key adds to default_key_mappings, then copy to Mappings
      imc.modify()
      imc.map_key(ia_ref, e_key)
      dkm = imc.get_editor_property("default_key_mappings")
      sub = list(dkm.get_editor_property("mappings"))
      imc.set_editor_property("Mappings", sub)
      unreal.EditorAssetLibrary.save_asset("/MyikaBridge/Input/IMC_Myika")

This asset creation step MUST be part of your plan whenever you build something that uses UMyikaInteractionComponent. Do it as the first step, before creating any BP that references these assets.

IMPORTANT: When creating a BP that uses UMyikaInteractionComponent, also ensure the IMC is added to the player's Enhanced Input subsystem at runtime. Include this as a final verification note to the user: "Press E near the door to interact. If E doesn't work, the InputMappingContext may need to be added to your project's default pawn setup."

## Example: Door Scenario
When the user asks to "build a door" or "create an interactable door", use exactly 3 run_python calls:

Call 1 — Ensure input assets (skip if they exist):
  [use the input asset creation code from above]

Call 2 — Create BP and add components:
  import unreal
  asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
  # Delete existing BP_Door if present to avoid overwrite dialogs
  if unreal.EditorAssetLibrary.does_asset_exist("/Game/Blueprints/BP_Door"):
      unreal.EditorAssetLibrary.delete_asset("/Game/Blueprints/BP_Door")
  # Create BP_Door
  bp_factory = unreal.BlueprintFactory()
  bp_factory.set_editor_property("ParentClass", unreal.Actor)
  bp = asset_tools.create_asset("BP_Door", "/Game/Blueprints", unreal.Blueprint, bp_factory)
  subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
  handles = subsystem.k2_gather_subobject_data_for_blueprint(bp)
  root_handle = handles[0]
  # Add StaticMeshComponent
  params = unreal.AddNewSubobjectParams()
  params.set_editor_property("parent_handle", root_handle)
  params.set_editor_property("new_class", unreal.StaticMeshComponent)
  params.set_editor_property("blueprint_context", bp)
  mesh_handle, _ = subsystem.add_new_subobject(params)
  mesh_data = subsystem.k2_find_subobject_data_from_handle(mesh_handle)
  mesh = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(mesh_data, False)
  mesh.set_editor_property("StaticMesh", unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
  mesh.set_editor_property("RelativeScale3D", unreal.Vector(1.0, 0.1, 2.0))
  # Add MyikaInteractionComponent
  params2 = unreal.AddNewSubobjectParams()
  params2.set_editor_property("parent_handle", root_handle)
  params2.set_editor_property("new_class", unreal.MyikaInteractionComponent)
  params2.set_editor_property("blueprint_context", bp)
  ic_handle, _ = subsystem.add_new_subobject(params2)
  ic_data = subsystem.k2_find_subobject_data_from_handle(ic_handle)
  ic = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(ic_data, False)
  ic.set_editor_property("InteractionExtent", unreal.Vector(150, 150, 150))
  ic.set_editor_property("bAutoRotate", True)
  ic.set_editor_property("RotationAngle", 90.0)
  ic.set_editor_property("RotationDuration", 0.5)
  ic.set_editor_property("InputAction", unreal.EditorAssetLibrary.load_asset("/MyikaBridge/Input/IA_Interact"))
  # Compile and save
  unreal.BlueprintEditorLibrary.compile_blueprint(bp)
  unreal.EditorAssetLibrary.save_asset("/Game/Blueprints/BP_Door")
  print("BP_Door created with DoorMesh + InteractionComponent")

Call 3 — Verify:
  Use read_blueprint_summary and get_compile_errors to confirm success.

UMyikaInteractionComponent handles rotation, overlap detection, and input binding internally — no graph work needed.

## Alternative: Graph-Wiring Door (advanced)
When the user needs custom door logic that goes beyond UMyikaInteractionComponent's properties (e.g., custom curves, multi-stage animations, sound triggers), use the graph tools:

Step 1 — Create BP + components via run_python (same as above, but set bAutoRotate=False)
Step 2 — paste_bp_nodes: Paste T3D for BeginPlay, Timeline, RLerp (MakeRot), SetRelativeRotation nodes
Step 3 — connect_pins: Wire the graph (BeginPlay→Timeline Play, Timeline float output→RLerp Alpha, RLerp→SetRelativeRotation NewRotation, etc.)
Step 4 — set_pin_default: Set RLerp B pin to "0, 90, 0" (the open rotation — ReconstructNode clobbers T3D defaults)
Step 5 — add_timeline_track: Add float track "DoorRotation" with keyframes [{time:0, value:0}, {time:1, value:1}]
Step 6 — Hook up interaction: Use UMyikaInteractionComponent's OnInteract delegate to toggle the timeline

For the simple "walk up and press E, door opens" request, ALWAYS use the component-based approach above — it's simpler and more reliable."#;

const MAX_TURNS: u32 = 40;

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
    journal_state: JournalState,
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

    // Start run journal
    let runs_dir = app.path().app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("runs");
    match RunJournal::start(&runs_dir, &message) {
        Ok(journal) => {
            *journal_state.lock().expect("journal lock") = Some(journal);
            log::info!("Run journal started in {:?}", runs_dir);
        }
        Err(e) => {
            log::warn!("Failed to start run journal: {}", e);
        }
    }

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
                let _ = app.emit("chat-event", ChatEvent::Error { message: e.clone() });
                let _ = app.emit("app-error", serde_json::json!({
                    "code": "CLAUDE_ERROR",
                    "message": "Claude CLI failed",
                    "details": e
                }));
            }
        }

        // End run journal
        if let Some(journal) = journal_state.lock().expect("journal lock").as_mut() {
            journal.end();
        }
        *journal_state.lock().expect("journal lock") = None;

        chat_state.is_running.store(false, Ordering::SeqCst);
    });
}

/// Inject Claude Code CLI routing env vars onto a Command before spawn.
///
/// Anthropic — no extra env (CLI uses its default endpoint).
/// Bedrock   — sets CLAUDE_CODE_USE_BEDROCK=1 + AWS_REGION. Trusts ambient AWS credentials
///             (the user's own SSO / IMDS / `~/.aws/credentials`). We never hold AWS secrets.
/// Vertex    — sets CLAUDE_CODE_USE_VERTEX=1 + ANTHROPIC_VERTEX_PROJECT_ID + CLOUD_ML_REGION.
///             Trusts ambient GCP credentials (`gcloud auth application-default login`).
///
/// We never `env_clear()` — the spawned CLI inherits the user's PATH, terminal env,
/// HOME, etc. Routing env vars layer on top of whatever was already set.
fn apply_routing_env(cmd: &mut Command, routing: &ClaudeCodeRouting) {
    match routing {
        ClaudeCodeRouting::Anthropic => {}
        ClaudeCodeRouting::Bedrock { aws_region } => {
            cmd.env("CLAUDE_CODE_USE_BEDROCK", "1");
            cmd.env("AWS_REGION", aws_region);
        }
        ClaudeCodeRouting::Vertex { gcp_project, gcp_region } => {
            cmd.env("CLAUDE_CODE_USE_VERTEX", "1");
            cmd.env("ANTHROPIC_VERTEX_PROJECT_ID", gcp_project);
            cmd.env("CLOUD_ML_REGION", gcp_region);
        }
    }
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

    apply_routing_env(&mut cmd, &settings.claude_code_routing);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Some(parent) = mcp_config_path.parent() {
        cmd.current_dir(parent);
    }

    log::info!(
        "Spawning claude CLI with model={} routing={}",
        model_flag,
        settings.claude_code_routing.status_label()
    );

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
