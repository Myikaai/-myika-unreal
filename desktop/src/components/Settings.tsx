import { useEffect, useState } from "react";
import { getSettings, saveSettings, type AppSettings } from "../lib/ipc";

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings>({
    provider: "claude-code",
    model: "sonnet",
    bridge_port: 17645,
    trust_mode: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(settings);
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-[480px] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-primary">Settings</h2>
          <button onClick={onClose} className="text-muted hover:text-primary">&#x2715;</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">AI Provider</label>
            <select
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
              className="w-full bg-[var(--bg-surface)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="claude-code">Claude Code (uses your subscription)</option>
            </select>
            <p className="text-xs text-muted mt-1">Uses your existing Claude Code subscription. No API key needed.</p>
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">Model</label>
            <select
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className="w-full bg-[var(--bg-surface)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="sonnet">Claude Sonnet (fast)</option>
              <option value="opus">Claude Opus (deep thinking)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">Bridge Port</label>
            <input
              type="number"
              value={settings.bridge_port}
              onChange={(e) => setSettings({ ...settings, bridge_port: parseInt(e.target.value) || 17645 })}
              className="w-full bg-[var(--bg-surface)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          {/*
            Trust Mode UI removed: bypassing run_python approval is unsafe
            given prompt-injection risks. The persisted field is forced to
            false on load (see db.rs) so old database values cannot enable it.
          */}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
