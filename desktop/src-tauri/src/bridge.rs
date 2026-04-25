use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

const WS_URL: &str = "ws://127.0.0.1:17645";
const REQUEST_TIMEOUT_SECS: u64 = 30;
const MAX_BACKOFF_SECS: u64 = 10;

// --- Types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BridgeStatus {
    Disconnected,
    Connecting,
    Connected {
        project_name: String,
        ue_version: String,
    },
}

#[derive(Debug, Deserialize)]
struct BridgeEnvelope {
    id: String,
    #[serde(rename = "type")]
    msg_type: String,
    payload: Value,
}

#[derive(Debug, Serialize)]
struct OutgoingEnvelope {
    id: String,
    #[serde(rename = "type")]
    msg_type: String,
    payload: Value,
}

/// Commands sent from the app to the WS loop
enum BridgeCommand {
    SendRequest {
        id: String,
        payload: Value,
        reply: oneshot::Sender<Value>,
    },
}

pub struct BridgeState {
    status: Arc<Mutex<BridgeStatus>>,
    cmd_tx: mpsc::Sender<BridgeCommand>,
}

// --- Tauri command ---

#[tauri::command]
pub async fn get_bridge_status(
    state: tauri::State<'_, BridgeState>,
) -> Result<BridgeStatus, String> {
    let status = state.status.lock().await.clone();
    Ok(status)
}

// --- Public API for other modules ---

impl BridgeState {
    /// Send a tool request over the bridge and wait for the response.
    pub async fn send_tool_request(&self, tool: String, args: Value) -> Result<Value, String> {
        let id = Uuid::new_v4().to_string();
        let payload = serde_json::json!({
            "tool": tool,
            "args": args,
        });

        let (reply_tx, reply_rx) = oneshot::channel();

        self.cmd_tx
            .send(BridgeCommand::SendRequest {
                id: id.clone(),
                payload,
                reply: reply_tx,
            })
            .await
            .map_err(|_| "Bridge loop not running".to_string())?;

        // Wait with timeout
        match tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS), reply_rx).await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(_)) => Err("Bridge response channel closed".to_string()),
            Err(_) => Err("Bridge request timed out".to_string()),
        }
    }
}

// --- Bridge loop ---

async fn set_status(
    status_lock: &Arc<Mutex<BridgeStatus>>,
    new_status: BridgeStatus,
    app: &AppHandle,
) {
    let mut s = status_lock.lock().await;
    *s = new_status.clone();
    let _ = app.emit("bridge-status-changed", &new_status);
}

pub fn spawn_bridge_loop(app: &AppHandle) -> BridgeState {
    let status = Arc::new(Mutex::new(BridgeStatus::Disconnected));
    let (cmd_tx, cmd_rx) = mpsc::channel::<BridgeCommand>(64);

    let state = BridgeState {
        status: status.clone(),
        cmd_tx,
    };

    let app_handle = app.clone();
    let status_clone = status.clone();

    tauri::async_runtime::spawn(async move {
        bridge_loop(app_handle, status_clone, cmd_rx).await;
    });

    state
}

async fn bridge_loop(
    app: AppHandle,
    status: Arc<Mutex<BridgeStatus>>,
    mut cmd_rx: mpsc::Receiver<BridgeCommand>,
) {
    let mut backoff_secs: u64 = 1;

    loop {
        set_status(&status, BridgeStatus::Connecting, &app).await;
        log::info!("Connecting to UE bridge at {}", WS_URL);

        match connect_async(WS_URL).await {
            Ok((ws_stream, _)) => {
                log::info!("Connected to UE bridge");
                backoff_secs = 1; // Reset backoff on successful connect

                handle_connection(ws_stream, &app, &status, &mut cmd_rx).await;

                // Connection ended - set disconnected
                set_status(&status, BridgeStatus::Disconnected, &app).await;
                log::info!("Disconnected from UE bridge, will retry...");
            }
            Err(e) => {
                log::warn!("Failed to connect to UE bridge: {}", e);
                set_status(&status, BridgeStatus::Disconnected, &app).await;
            }
        }

        // Wait before retrying
        sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
    }
}

async fn handle_connection(
    ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
    app: &AppHandle,
    status: &Arc<Mutex<BridgeStatus>>,
    cmd_rx: &mut mpsc::Receiver<BridgeCommand>,
) {
    let (mut ws_sink, mut ws_stream_read) = ws_stream.split();
    let pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    loop {
        tokio::select! {
            // Incoming WS message
            msg = ws_stream_read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_message(
                            &text,
                            app,
                            status,
                            &pending_requests,
                        ).await;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        log::info!("WebSocket closed");
                        break;
                    }
                    Some(Err(e)) => {
                        log::error!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {
                        // Ignore ping/pong/binary
                    }
                }
            }

            // Outgoing command from app
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(BridgeCommand::SendRequest { id, payload, reply }) => {
                        let envelope = OutgoingEnvelope {
                            id: id.clone(),
                            msg_type: "request".to_string(),
                            payload,
                        };
                        match serde_json::to_string(&envelope) {
                            Ok(json) => {
                                pending_requests.lock().await.insert(id, reply);
                                if let Err(e) = ws_sink.send(Message::Text(json.into())).await {
                                    log::error!("Failed to send WS message: {}", e);
                                    break;
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to serialize request: {}", e);
                                let _ = reply.send(serde_json::json!({
                                    "error": format!("Serialization error: {}", e)
                                }));
                            }
                        }
                    }
                    None => {
                        // Command channel closed, app is shutting down
                        log::info!("Command channel closed");
                        break;
                    }
                }
            }
        }
    }

    // Clean up pending requests on disconnect
    let mut pending = pending_requests.lock().await;
    for (_, sender) in pending.drain() {
        let _ = sender.send(serde_json::json!({
            "error": "Bridge disconnected"
        }));
    }
}

async fn handle_message(
    text: &str,
    app: &AppHandle,
    status: &Arc<Mutex<BridgeStatus>>,
    pending_requests: &Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
) {
    let envelope: BridgeEnvelope = match serde_json::from_str(text) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("Failed to parse bridge message: {}", e);
            return;
        }
    };

    match envelope.msg_type.as_str() {
        "event" => {
            handle_event(&envelope, app, status).await;
        }
        "response" => {
            // Correlate with pending request
            let mut pending = pending_requests.lock().await;
            if let Some(sender) = pending.remove(&envelope.id) {
                let _ = sender.send(envelope.payload);
            } else {
                log::warn!("Received response for unknown request id: {}", envelope.id);
            }
        }
        other => {
            log::warn!("Unknown message type: {}", other);
        }
    }
}

async fn handle_event(
    envelope: &BridgeEnvelope,
    app: &AppHandle,
    status: &Arc<Mutex<BridgeStatus>>,
) {
    let event_name = envelope
        .payload
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match event_name {
        "bridge.ready" => {
            let data = envelope.payload.get("data");
            let project_name = data
                .and_then(|d| d.get("projectName"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let ue_version = data
                .and_then(|d| d.get("ueVersion"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();

            log::info!(
                "Bridge ready: project={}, ue_version={}",
                project_name,
                ue_version
            );

            set_status(
                status,
                BridgeStatus::Connected {
                    project_name,
                    ue_version,
                },
                app,
            )
            .await;
        }
        _ => {
            log::debug!("Unhandled event: {}", event_name);
        }
    }
}
