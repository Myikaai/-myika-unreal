mod bridge;
mod claude;
mod db;
mod run_journal;
mod tool_proxy;
mod tools;

use bridge::{get_bridge_status, spawn_bridge_loop};
use claude::ChatState;
use db::{AppSettings, Db};
use run_journal::RunJournal;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use std::io::Write;
use tool_proxy::PlanApproval;

type JournalState = Arc<std::sync::Mutex<Option<RunJournal>>>;

// --- Tauri Commands ---

#[tauri::command]
async fn get_settings(db: tauri::State<'_, Arc<Db>>) -> Result<AppSettings, String> {
    Ok(db.get_settings())
}

#[tauri::command]
async fn save_settings(
    db: tauri::State<'_, Arc<Db>>,
    settings: AppSettings,
) -> Result<(), String> {
    db.save_settings(&settings)
}

#[tauri::command]
async fn send_message(
    app: tauri::AppHandle,
    message: String,
    db: tauri::State<'_, Arc<Db>>,
    chat_state: tauri::State<'_, Arc<ChatState>>,
    mcp_config: tauri::State<'_, McpConfigPath>,
    journal: tauri::State<'_, JournalState>,
) -> Result<String, String> {
    let settings = db.get_settings();
    let chat_state = chat_state.inner().clone();
    let db = db.inner().clone();
    let mcp_path = mcp_config.0.clone();
    let journal = journal.inner().clone();

    // Fires off an OS thread — completely off the tokio runtime
    claude::send_message_blocking(app, message, settings, chat_state, db, mcp_path, journal);

    Ok("sent".to_string())
}

#[tauri::command]
async fn clear_chat(
    db: tauri::State<'_, Arc<Db>>,
    chat_state: tauri::State<'_, Arc<ChatState>>,
) -> Result<(), String> {
    db.clear_messages()?;
    chat_state.history.lock().expect("history lock").clear();
    Ok(())
}

#[tauri::command]
async fn resolve_plan(
    approved: bool,
    plan_approval: tauri::State<'_, Arc<PlanApproval>>,
) -> Result<(), String> {
    plan_approval.resolve(approved).await;
    Ok(())
}

#[tauri::command]
async fn reconnect_bridge(
    state: tauri::State<'_, Arc<bridge::BridgeState>>,
) -> Result<(), String> {
    state.reconnect().await;
    Ok(())
}

struct McpConfigPath(PathBuf);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format(|buf, record| {
            writeln!(buf, "[{}] {}", record.level(), record.args())
        })
        .init();

    log::info!("Myika Desktop starting up");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_bridge_status,
            get_settings,
            save_settings,
            send_message,
            clear_chat,
            resolve_plan,
            reconnect_bridge
        ])
        .setup(|app| {
            // Initialize database
            let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
            let db = Arc::new(Db::open(&app_dir).expect("Failed to open database"));
            app.manage(db);

            // Start bridge
            let bridge_state = spawn_bridge_loop(&app.handle());
            let bridge_arc = Arc::new(bridge_state);

            // Plan approval state
            let plan_approval = Arc::new(PlanApproval::new());
            app.manage(plan_approval.clone());

            // Run journal state (None until a run starts)
            let journal_state: JournalState = Arc::new(std::sync::Mutex::new(None));
            app.manage(journal_state.clone());

            // Chat state
            let chat_state = Arc::new(ChatState::new());
            app.manage(chat_state);

            // Start tool proxy (TCP server for MCP bridge)
            let bridge_for_proxy = bridge_arc.clone();
            let app_handle = app.handle().clone();
            let plan_approval_for_proxy = plan_approval.clone();
            let journal_for_proxy = journal_state.clone();
            tauri::async_runtime::spawn(async move {
                tool_proxy::start_tool_proxy(bridge_for_proxy, app_handle, plan_approval_for_proxy, journal_for_proxy).await;
            });

            app.manage(bridge_arc);

            // MCP config path
            let mcp_config_path = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| PathBuf::from("."));

            // The mcp-config.json should be next to the desktop app sources
            // In dev, it's in desktop/; in prod it would be bundled
            let config_path = find_mcp_config(&mcp_config_path);
            log::info!("MCP config path: {:?}", config_path);
            app.manage(McpConfigPath(config_path));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn find_mcp_config(exe_dir: &PathBuf) -> PathBuf {
    // Search in locations relative to the executable, covering dev and prod layouts.
    // Never hardcode absolute developer paths here — this file is in a public repo.
    let candidates = [
        exe_dir.join("mcp-config.json"),
        exe_dir.join("../mcp-config.json"),
        exe_dir.join("../../mcp-config.json"),
        exe_dir.join("../../../mcp-config.json"),    // dev: target/debug/ -> src-tauri/ -> desktop/
        exe_dir.join("../../../../mcp-config.json"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }

    // Fallback: place next to the executable so logs point somewhere sensible.
    exe_dir.join("mcp-config.json")
}
