import { useEffect, useState } from "react";
import { getSettings, saveSettings, type AppSettings } from "../lib/ipc";
import Icon from "./Icon";

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

  const inputClass = "w-full bg-[var(--color-bg-surface)] text-primary text-sm rounded px-3 py-2 border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-border-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="modal-backdrop fixed inset-0 bg-[var(--color-bg-overlay)] flex items-center justify-center z-50">
      <div className="modal-panel bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg w-[480px] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
            style={{ transitionDuration: "var(--duration-default)", transitionTimingFunction: "var(--ease-out)" }}
          >
            <Icon name="deny" size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-secondary mb-1">AI Provider</label>
            <select
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
              className={inputClass}
              style={{ transitionDuration: "var(--duration-default)", transitionTimingFunction: "var(--ease-out)" }}
            >
              <option value="claude-code">Claude Code (uses your subscription)</option>
            </select>
            <p className="text-xs text-muted mt-1">Uses your existing Claude Code subscription. No API key needed.</p>
          </div>

          <div>
            <label className="block text-sm text-secondary mb-1">Model</label>
            <select
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className={inputClass}
              style={{ transitionDuration: "var(--duration-default)", transitionTimingFunction: "var(--ease-out)" }}
            >
              <option value="sonnet">Claude Sonnet (fast)</option>
              <option value="opus">Claude Opus (deep thinking)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-secondary mb-1">Bridge Port</label>
            <input
              type="number"
              value={settings.bridge_port}
              onChange={(e) => setSettings({ ...settings, bridge_port: parseInt(e.target.value) || 17645 })}
              className={inputClass}
              style={{ transitionDuration: "var(--duration-default)", transitionTimingFunction: "var(--ease-out)" }}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[var(--color-accent-default)] text-[var(--color-text-on-accent)] text-sm font-medium rounded hover:bg-[var(--color-accent-glow)] active:bg-[var(--color-accent-active)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
            style={{ transitionDuration: "var(--duration-default)", transitionTimingFunction: "var(--ease-out)" }}
          >
            {saving ? "Saving..." : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
