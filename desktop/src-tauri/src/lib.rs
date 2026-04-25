mod bridge;
mod claude;
mod db;
mod tools;

use bridge::{get_bridge_status, spawn_bridge_loop};
use tauri::Manager;
use std::io::Write;

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
        .invoke_handler(tauri::generate_handler![get_bridge_status])
        .setup(|app| {
            let bridge_state = spawn_bridge_loop(&app.handle());
            app.manage(bridge_state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
