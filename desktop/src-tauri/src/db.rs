use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub provider: String,   // "claude-code"
    pub model: String,      // "sonnet", "opus"
    pub bridge_port: u16,
    pub trust_mode: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            provider: "claude-code".to_string(),
            model: "sonnet".to_string(),
            bridge_port: 17645,
            trust_mode: false,
        }
    }
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(app_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(app_dir).map_err(|e| format!("Failed to create app dir: {e}"))?;
        let db_path = app_dir.join("myika.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {e}"))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_name TEXT,
                tool_args TEXT,
                tool_result TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );"
        ).map_err(|e| format!("Failed to create tables: {e}"))?;

        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn get_settings(&self) -> AppSettings {
        let conn = self.conn.lock().unwrap();
        let mut settings = AppSettings::default();

        if let Ok(v) = conn.query_row(
            "SELECT value FROM settings WHERE key = 'provider'",
            [], |row| row.get::<_, String>(0),
        ) { settings.provider = v; }

        if let Ok(v) = conn.query_row(
            "SELECT value FROM settings WHERE key = 'model'",
            [], |row| row.get::<_, String>(0),
        ) { settings.model = v; }

        if let Ok(v) = conn.query_row(
            "SELECT value FROM settings WHERE key = 'bridge_port'",
            [], |row| row.get::<_, String>(0),
        ) { if let Ok(p) = v.parse() { settings.bridge_port = p; } }

        // trust_mode is intentionally ignored on load. The UI toggle has been
        // removed and the field is force-disabled here so existing DB rows from
        // a previous version cannot re-enable approval-skipping for run_python.
        settings.trust_mode = false;

        settings
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let pairs = [
            ("provider", settings.provider.as_str()),
            ("model", settings.model.as_str()),
            ("bridge_port", &settings.bridge_port.to_string()),
            ("trust_mode", if settings.trust_mode { "true" } else { "false" }),
        ];
        for (key, value) in pairs {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            ).map_err(|e| format!("Failed to save setting {key}: {e}"))?;
        }
        Ok(())
    }

    pub fn save_message(&self, role: &str, content: &str, tool_name: Option<&str>, tool_args: Option<&str>, tool_result: Option<&str>) -> Result<i64, String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages (role, content, tool_name, tool_args, tool_result) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![role, content, tool_name, tool_args, tool_result],
        ).map_err(|e| format!("Failed to save message: {e}"))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_recent_messages(&self, limit: usize) -> Vec<(String, String)> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT role, content FROM messages ORDER BY id DESC LIMIT ?1"
        ).unwrap();
        let rows: Vec<_> = stmt.query_map(params![limit as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).unwrap().filter_map(|r| r.ok()).collect();
        rows.into_iter().rev().collect()
    }

    pub fn clear_messages(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages", [])
            .map_err(|e| format!("Failed to clear messages: {e}"))?;
        Ok(())
    }
}
