interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-[480px] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-primary">Settings</h2>
          <button onClick={onClose} className="text-muted hover:text-primary">&#x2715;</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Anthropic API Key</label>
            <input
              type="password"
              placeholder="sk-ant-..."
              className="w-full bg-[var(--bg-surface)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">Model</label>
            <select className="w-full bg-[var(--bg-surface)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none">
              <option value="claude-sonnet-4-5-20250514">Claude Sonnet 4.5</option>
              <option value="claude-opus-4-5-20250918">Claude Opus 4.5</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">Bridge Port</label>
            <input
              type="number"
              defaultValue={17645}
              className="w-full bg-[var(--bg-surface)] text-primary text-sm rounded px-3 py-2 border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-muted">Trust Mode (skip run_python approval)</label>
            <input type="checkbox" className="accent-[var(--accent)]" />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded hover:opacity-90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
