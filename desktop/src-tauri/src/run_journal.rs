use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    RunStart,
    RunEnd,
    PlanProposed,
    PlanApproved,
    PlanCancelled,
    ToolCall,
    ToolResult,
}

#[derive(Debug, Serialize)]
struct JournalEntry {
    ts: String,
    phase: Phase,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    args: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt: Option<String>,
}

const MAX_RESULT_BYTES: usize = 32 * 1024;
const MAX_RUN_AGE_DAYS: u64 = 30;

pub struct RunJournal {
    file: File,
}

impl RunJournal {
    /// Start a new run. Creates the JSONL file and writes the run_start entry.
    pub fn start(runs_dir: &PathBuf, user_prompt: &str) -> Result<Self, String> {
        fs::create_dir_all(runs_dir)
            .map_err(|e| format!("Failed to create runs dir: {e}"))?;

        // Cleanup old runs (best-effort)
        let _ = cleanup_old_runs(runs_dir);

        let ts = now_iso();
        let filename = format!("{}.jsonl", ts.replace(':', "-"));
        let path = runs_dir.join(&filename);

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("Failed to create journal: {e}"))?;

        let mut journal = Self { file };
        journal.write_entry(JournalEntry {
            ts,
            phase: Phase::RunStart,
            tool: None,
            args: None,
            result: None,
            duration_ms: None,
            ok: None,
            error: None,
            prompt: Some(user_prompt.to_string()),
        });
        Ok(journal)
    }

    pub fn log_tool_call(&mut self, tool: &str, args: &serde_json::Value) {
        self.write_entry(JournalEntry {
            ts: now_iso(),
            phase: Phase::ToolCall,
            tool: Some(tool.to_string()),
            args: Some(args.clone()),
            result: None,
            duration_ms: None,
            ok: None,
            error: None,
            prompt: None,
        });
    }

    pub fn log_tool_result(
        &mut self,
        tool: &str,
        result: &serde_json::Value,
        duration_ms: u64,
        ok: bool,
        error: Option<&str>,
    ) {
        let truncated = truncate_value(result, MAX_RESULT_BYTES);
        self.write_entry(JournalEntry {
            ts: now_iso(),
            phase: Phase::ToolResult,
            tool: Some(tool.to_string()),
            args: None,
            result: Some(truncated),
            duration_ms: Some(duration_ms),
            ok: Some(ok),
            error: error.map(String::from),
            prompt: None,
        });
    }

    pub fn log_plan_event(&mut self, phase: Phase, summary: Option<&str>) {
        self.write_entry(JournalEntry {
            ts: now_iso(),
            phase,
            tool: None,
            args: None,
            result: summary.map(|s| serde_json::Value::String(s.to_string())),
            duration_ms: None,
            ok: None,
            error: None,
            prompt: None,
        });
    }

    pub fn end(&mut self) {
        self.write_entry(JournalEntry {
            ts: now_iso(),
            phase: Phase::RunEnd,
            tool: None,
            args: None,
            result: None,
            duration_ms: None,
            ok: None,
            error: None,
            prompt: None,
        });
    }

    fn write_entry(&mut self, entry: JournalEntry) {
        if let Ok(line) = serde_json::to_string(&entry) {
            let _ = writeln!(self.file, "{}", line);
            let _ = self.file.flush();
        }
    }
}

fn now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    let (year, month, day, hour, min, sec) = secs_to_utc(secs);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, min, sec, millis
    )
}

fn secs_to_utc(secs: u64) -> (u64, u64, u64, u64, u64, u64) {
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3600) % 24;
    let mut days = secs / 86400;
    let mut year = 1970u64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = is_leap(year);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 0u64;
    for (i, &md) in month_days.iter().enumerate() {
        if days < md as u64 {
            month = i as u64 + 1;
            break;
        }
        days -= md as u64;
    }
    (year, month, days + 1, hour, min, sec)
}

fn is_leap(y: u64) -> bool {
    y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
}

fn truncate_value(value: &serde_json::Value, max_bytes: usize) -> serde_json::Value {
    let s = value.to_string();
    if s.len() <= max_bytes {
        value.clone()
    } else {
        serde_json::Value::String(format!(
            "{}...[truncated, {} bytes total]",
            &s[..max_bytes],
            s.len()
        ))
    }
}

fn cleanup_old_runs(runs_dir: &PathBuf) -> Result<(), std::io::Error> {
    let cutoff =
        std::time::SystemTime::now() - std::time::Duration::from_secs(MAX_RUN_AGE_DAYS * 86400);
    for entry in fs::read_dir(runs_dir)? {
        let entry = entry?;
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if modified < cutoff {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
    Ok(())
}
