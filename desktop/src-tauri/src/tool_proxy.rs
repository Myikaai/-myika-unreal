use crate::bridge::BridgeState;
use crate::claude::ChatEvent;
use crate::run_journal::{Phase, RunJournal};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

const PROXY_PORT: u16 = 17646;

type JournalState = Arc<std::sync::Mutex<Option<RunJournal>>>;

/// Shared state for plan approval flow.
/// The tool proxy sets the sender when a propose_plan call arrives;
/// the resolve_plan Tauri command sends the user's decision.
pub struct PlanApproval {
    pending: tokio::sync::Mutex<Option<tokio::sync::oneshot::Sender<bool>>>,
}

impl PlanApproval {
    pub fn new() -> Self {
        Self {
            pending: tokio::sync::Mutex::new(None),
        }
    }

    pub async fn resolve(&self, approved: bool) {
        let mut lock = self.pending.lock().await;
        if let Some(sender) = lock.take() {
            let _ = sender.send(approved);
        }
    }
}

/// Start a TCP server on localhost:17646 that accepts tool call requests
/// from the MCP bridge server and forwards them to the UE bridge WebSocket.
/// propose_plan calls are intercepted and handled locally.
///
/// Protocol: newline-delimited JSON
/// Request:  {"tool": "list_assets", "args": {"path_filter": "/Game"}}
/// Response: {"ok": true, "result": {...}}
pub async fn start_tool_proxy(
    bridge: Arc<BridgeState>,
    app: AppHandle,
    plan_approval: Arc<PlanApproval>,
    journal: JournalState,
) {
    let listener = match TcpListener::bind(format!("127.0.0.1:{}", PROXY_PORT)).await {
        Ok(l) => {
            log::info!("Tool proxy listening on 127.0.0.1:{}", PROXY_PORT);
            l
        }
        Err(e) => {
            log::error!("Failed to start tool proxy on port {}: {}", PROXY_PORT, e);
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                log::debug!("Tool proxy connection from {}", addr);
                let bridge = bridge.clone();
                let app = app.clone();
                let plan_approval = plan_approval.clone();
                let journal = journal.clone();
                tokio::spawn(async move {
                    handle_proxy_connection(stream, bridge, app, plan_approval, journal).await;
                });
            }
            Err(e) => {
                log::error!("Tool proxy accept error: {}", e);
            }
        }
    }
}

async fn handle_proxy_connection(
    stream: tokio::net::TcpStream,
    bridge: Arc<BridgeState>,
    app: AppHandle,
    plan_approval: Arc<PlanApproval>,
    journal: JournalState,
) {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let err = serde_json::json!({
                    "ok": false,
                    "error": {"code": "INVALID_JSON", "message": format!("{}", e)}
                });
                let _ = writer.write_all(format!("{}\n", err).as_bytes()).await;
                continue;
            }
        };

        let tool = request.get("tool").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let args = request.get("args").cloned().unwrap_or(Value::Object(Default::default()));

        // Journal: log tool call
        if let Ok(mut j) = journal.lock() {
            if let Some(ref mut j) = *j {
                j.log_tool_call(&tool, &args);
            }
        }

        let start = std::time::Instant::now();

        let response = if tool == "propose_plan" {
            handle_propose_plan(&app, &plan_approval, &args, &journal).await
        } else {
            log::info!("Tool proxy: dispatching '{}' to bridge", tool);
            match bridge.send_tool_request(tool.clone(), args).await {
                Ok(payload) => payload,
                Err(e) => {
                    let _ = app.emit("app-error", serde_json::json!({
                        "code": "TOOL_ERROR",
                        "message": format!("Tool '{}' failed", tool),
                        "details": e.clone()
                    }));
                    serde_json::json!({
                        "ok": false,
                        "error": {"code": "BRIDGE_ERROR", "message": e}
                    })
                }
            }
        };

        let duration_ms = start.elapsed().as_millis() as u64;

        // Journal: log tool result
        let is_ok = response.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
        let error_msg = if !is_ok {
            response.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .map(String::from)
        } else {
            None
        };
        if let Ok(mut j) = journal.lock() {
            if let Some(ref mut j) = *j {
                j.log_tool_result(&tool, &response, duration_ms, is_ok, error_msg.as_deref());
            }
        }

        let response_line = format!("{}\n", serde_json::to_string(&response).unwrap_or_default());
        if writer.write_all(response_line.as_bytes()).await.is_err() {
            break;
        }
    }
}

async fn handle_propose_plan(
    app: &AppHandle,
    plan_approval: &Arc<PlanApproval>,
    args: &Value,
    journal: &JournalState,
) -> Value {
    let steps: Vec<String> = args
        .get("steps")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let summary = args
        .get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    log::info!(
        "Tool proxy: intercepted propose_plan ({} steps): {}",
        steps.len(),
        summary
    );

    // Journal: plan proposed
    if let Ok(mut j) = journal.lock() {
        if let Some(ref mut j) = *j {
            j.log_plan_event(Phase::PlanProposed, Some(&summary));
        }
    }

    // Set up the approval channel
    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut lock = plan_approval.pending.lock().await;
        *lock = Some(tx);
    }

    // Emit the plan to the frontend
    let _ = app.emit(
        "chat-event",
        ChatEvent::PlanProposed {
            steps: steps.clone(),
            summary: summary.clone(),
        },
    );

    // Block until user approves or cancels (or channel drops)
    let approved = rx.await.unwrap_or(false);

    log::info!("Tool proxy: plan {} by user", if approved { "approved" } else { "cancelled" });

    // Journal: plan approved/cancelled
    if let Ok(mut j) = journal.lock() {
        if let Some(ref mut j) = *j {
            let phase = if approved { Phase::PlanApproved } else { Phase::PlanCancelled };
            j.log_plan_event(phase, Some(&summary));
        }
    }

    if approved {
        serde_json::json!({
            "ok": true,
            "result": {
                "approved": true,
                "message": "User approved the plan. Proceed with execution."
            }
        })
    } else {
        serde_json::json!({
            "ok": true,
            "result": {
                "approved": false,
                "message": "User cancelled the plan. Do not execute any steps. Acknowledge the cancellation."
            }
        })
    }
}
