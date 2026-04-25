use crate::bridge::BridgeState;
use serde_json::Value;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

const PROXY_PORT: u16 = 17646;

/// Start a TCP server on localhost:17646 that accepts tool call requests
/// from the MCP bridge server and forwards them to the UE bridge WebSocket.
///
/// Protocol: newline-delimited JSON
/// Request:  {"tool": "list_assets", "args": {"path_filter": "/Game"}}
/// Response: {"ok": true, "result": {...}}
pub async fn start_tool_proxy(bridge: Arc<BridgeState>) {
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
                tokio::spawn(async move {
                    handle_proxy_connection(stream, bridge).await;
                });
            }
            Err(e) => {
                log::error!("Tool proxy accept error: {}", e);
            }
        }
    }
}

async fn handle_proxy_connection(stream: tokio::net::TcpStream, bridge: Arc<BridgeState>) {
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

        log::info!("Tool proxy: dispatching '{}' to bridge", tool);

        let result = bridge.send_tool_request(tool, args).await;

        let response = match result {
            Ok(payload) => payload,
            Err(e) => serde_json::json!({
                "ok": false,
                "error": {"code": "BRIDGE_ERROR", "message": e}
            }),
        };

        let response_line = format!("{}\n", serde_json::to_string(&response).unwrap_or_default());
        if writer.write_all(response_line.as_bytes()).await.is_err() {
            break;
        }
    }
}
