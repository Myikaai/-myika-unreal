use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{tungstenite::Message, tungstenite::protocol::Role, WebSocketStream};
use uuid::Uuid;

const BRIDGE_HOST: &str = "127.0.0.1";
const BRIDGE_PORT: u16 = 17645;
const REQUEST_TIMEOUT_SECS: u64 = 30;
const MAX_BACKOFF_SECS: u64 = 10;

// --- Types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BridgeStatus {
    Disconnected {
        error: Option<String>,
    },
    Connecting {
        attempt: u32,
    },
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
    reconnect_notify: Arc<tokio::sync::Notify>,
}

// --- Tauri command ---

#[tauri::command]
pub async fn get_bridge_status(
    state: tauri::State<'_, Arc<BridgeState>>,
) -> Result<BridgeStatus, String> {
    let status = state.status.lock().await.clone();
    Ok(status)
}

// --- Public API for other modules ---

impl BridgeState {
    /// Signal the bridge loop to reconnect immediately (resets backoff).
    pub async fn reconnect(&self) {
        self.reconnect_notify.notify_one();
    }

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
    let status = Arc::new(Mutex::new(BridgeStatus::Disconnected { error: None }));
    let (cmd_tx, cmd_rx) = mpsc::channel::<BridgeCommand>(64);
    let reconnect_notify = Arc::new(tokio::sync::Notify::new());

    let state = BridgeState {
        status: status.clone(),
        cmd_tx,
        reconnect_notify: reconnect_notify.clone(),
    };

    let app_handle = app.clone();
    let status_clone = status.clone();

    tauri::async_runtime::spawn(async move {
        bridge_loop(app_handle, status_clone, cmd_rx, reconnect_notify).await;
    });

    state
}

/// Locate the bridge token file. The UE plugin owns this file — the desktop
/// app only ever reads it.
fn bridge_token_path() -> Result<PathBuf, String> {
    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "LOCALAPPDATA env var not set".to_string())?;
    Ok(PathBuf::from(local_app_data).join("Myika").join("bridge-token"))
}

/// Read the shared-secret token written by the UE plugin. Returns a friendly
/// error if the file is missing — the bridge loop's retry will keep trying
/// until the UE plugin starts and creates it.
fn read_bridge_token() -> Result<String, String> {
    let path = bridge_token_path()?;
    match std::fs::read_to_string(&path) {
        Ok(s) => {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() {
                Err(format!("token file is empty: {}", path.display()))
            } else {
                Ok(trimmed)
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err("token file not found — is the UE plugin running?".to_string())
        }
        Err(e) => Err(format!("failed to read token file {}: {}", path.display(), e)),
    }
}

/// Perform a manual WebSocket handshake over a TCP stream.
/// We bypass tungstenite's built-in handshake because v0.26 has a
/// Sec-WebSocket-Accept validation issue with our UE server despite
/// the server computing correct Accept values.
async fn manual_ws_handshake(stream: &mut tokio::net::TcpStream) -> Result<(), String> {
    let token = read_bridge_token()?;

    let key_bytes: [u8; 16] = rand::random();
    let key = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key_bytes);

    let request = format!(
        "GET / HTTP/1.1\r\n\
         Host: {}:{}\r\n\
         Connection: Upgrade\r\n\
         Upgrade: websocket\r\n\
         Sec-WebSocket-Version: 13\r\n\
         Sec-WebSocket-Key: {}\r\n\
         X-Myika-Token: {}\r\n\
         \r\n",
        BRIDGE_HOST, BRIDGE_PORT, key, token
    );

    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("Failed to send handshake: {}", e))?;

    // Read response until \r\n\r\n
    let mut response = Vec::with_capacity(512);
    let mut buf = [0u8; 1];
    loop {
        let n = stream
            .read(&mut buf)
            .await
            .map_err(|e| format!("Failed to read handshake response: {}", e))?;
        if n == 0 {
            return Err("Connection closed during handshake".to_string());
        }
        response.push(buf[0]);
        if response.len() >= 4 && response[response.len() - 4..] == *b"\r\n\r\n" {
            break;
        }
        if response.len() > 8192 {
            return Err("Handshake response too large".to_string());
        }
    }

    let response_str = String::from_utf8_lossy(&response);
    let status_line = response_str.lines().next().unwrap_or("");
    if status_line.starts_with("HTTP/1.1 401") {
        return Err(
            "auth token mismatch — delete %LOCALAPPDATA%\\Myika\\bridge-token and restart UE"
                .to_string(),
        );
    }
    if !response_str.starts_with("HTTP/1.1 101") {
        return Err(format!("Expected 101, got: {}", status_line));
    }

    Ok(())
}

async fn bridge_loop(
    app: AppHandle,
    status: Arc<Mutex<BridgeStatus>>,
    mut cmd_rx: mpsc::Receiver<BridgeCommand>,
    reconnect_notify: Arc<tokio::sync::Notify>,
) {
    let mut backoff_secs: u64 = 1;
    let mut attempt: u32 = 0;
    let mut was_connected = false;

    loop {
        attempt += 1;
        set_status(&status, BridgeStatus::Connecting { attempt }, &app).await;
        log::info!(
            "Connecting to UE bridge at {}:{} (attempt {})",
            BRIDGE_HOST,
            BRIDGE_PORT,
            attempt
        );

        let result = async {
            let mut tcp_stream =
                tokio::net::TcpStream::connect(format!("{}:{}", BRIDGE_HOST, BRIDGE_PORT))
                    .await
                    .map_err(|e| format!("TCP connect failed: {}", e))?;

            manual_ws_handshake(&mut tcp_stream).await?;

            let ws_stream =
                WebSocketStream::from_raw_socket(tcp_stream, Role::Client, None).await;
            Ok::<_, String>(ws_stream)
        }
        .await;

        match result {
            Ok(ws_stream) => {
                log::info!("Connected to UE bridge");
                backoff_secs = 1;
                attempt = 0;
                was_connected = true;

                handle_connection(ws_stream, &app, &status, &mut cmd_rx).await;

                let error = "Connection closed".to_string();
                set_status(
                    &status,
                    BridgeStatus::Disconnected {
                        error: Some(error.clone()),
                    },
                    &app,
                )
                .await;

                // Emit app-error only when transitioning from connected to disconnected
                let _ = app.emit(
                    "app-error",
                    serde_json::json!({
                        "code": "BRIDGE_DISCONNECTED",
                        "message": "Lost connection to Unreal Engine editor",
                        "details": error
                    }),
                );

                log::info!("Disconnected from UE bridge, will retry...");
            }
            Err(e) => {
                log::warn!("Failed to connect to UE bridge: {}", e);

                // Extract short error code for display
                let short_error = if e.contains("ECONNREFUSED") || e.contains("Connection refused")
                {
                    "ECONNREFUSED".to_string()
                } else if e.contains("token") {
                    "AUTH_FAILED".to_string()
                } else {
                    e.clone()
                };

                set_status(
                    &status,
                    BridgeStatus::Disconnected {
                        error: Some(short_error),
                    },
                    &app,
                )
                .await;

                // Only emit app-error if we were previously connected (not startup retries)
                if was_connected {
                    let _ = app.emit(
                        "app-error",
                        serde_json::json!({
                            "code": "BRIDGE_DISCONNECTED",
                            "message": "Lost connection to Unreal Engine editor",
                            "details": e
                        }),
                    );
                }
            }
        }

        // Wait before retrying — but allow immediate retry via reconnect_notify
        tokio::select! {
            _ = sleep(Duration::from_secs(backoff_secs)) => {}
            _ = reconnect_notify.notified() => {
                log::info!("Manual reconnect requested, resetting backoff");
                backoff_secs = 1;
                attempt = 0;
            }
        }
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
    }
}

async fn handle_connection(
    ws_stream: WebSocketStream<tokio::net::TcpStream>,
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
