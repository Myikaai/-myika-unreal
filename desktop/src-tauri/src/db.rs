use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// Where the spawned Claude Code CLI sends LLM traffic. See
/// `docs/design/llm-provider-abstraction.md` for the full design.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClaudeCodeRouting {
    /// Default — talks to api.anthropic.com using whatever auth the CLI has.
    Anthropic,
    /// Routes through AWS Bedrock in the customer's account. Trusts ambient AWS credentials.
    Bedrock { aws_region: String },
    /// Routes through GCP Vertex in the customer's project. Trusts ambient GCP credentials.
    Vertex { gcp_project: String, gcp_region: String },
}

impl Default for ClaudeCodeRouting {
    fn default() -> Self {
        ClaudeCodeRouting::Anthropic
    }
}

impl ClaudeCodeRouting {
    /// Short label for the status line — never includes credentials.
    pub fn status_label(&self) -> String {
        match self {
            ClaudeCodeRouting::Anthropic => "Anthropic".to_string(),
            ClaudeCodeRouting::Bedrock { aws_region } => format!("Bedrock {aws_region}"),
            ClaudeCodeRouting::Vertex { gcp_project, gcp_region } => {
                format!("Vertex {gcp_project}/{gcp_region}")
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub provider: String,   // "claude-code"
    pub model: String,      // "sonnet", "opus"
    pub bridge_port: u16,
    pub trust_mode: bool,
    #[serde(default)]
    pub claude_code_routing: ClaudeCodeRouting,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            provider: "claude-code".to_string(),
            model: "sonnet".to_string(),
            bridge_port: 17645,
            trust_mode: false,
            claude_code_routing: ClaudeCodeRouting::default(),
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

        if let Ok(v) = conn.query_row(
            "SELECT value FROM settings WHERE key = 'claude_code_routing'",
            [], |row| row.get::<_, String>(0),
        ) {
            if let Ok(routing) = serde_json::from_str::<ClaudeCodeRouting>(&v) {
                settings.claude_code_routing = routing;
            }
            // Fall through to default on parse failure — never partially apply
            // a malformed routing config.
        }

        // trust_mode is intentionally ignored on load. The UI toggle has been
        // removed and the field is force-disabled here so existing DB rows from
        // a previous version cannot re-enable approval-skipping for run_python.
        settings.trust_mode = false;

        settings
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let routing_json = serde_json::to_string(&settings.claude_code_routing)
            .map_err(|e| format!("Failed to serialize claude_code_routing: {e}"))?;
        let bridge_port_str = settings.bridge_port.to_string();
        let pairs: [(&str, &str); 5] = [
            ("provider", settings.provider.as_str()),
            ("model", settings.model.as_str()),
            ("bridge_port", &bridge_port_str),
            ("trust_mode", if settings.trust_mode { "true" } else { "false" }),
            ("claude_code_routing", &routing_json),
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
