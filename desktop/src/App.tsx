import Chat from "./components/Chat";
import BridgeStatus from "./components/BridgeStatus";
import Settings from "./components/Settings";
import { useState } from "react";

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-base)]">
      {/* Top bar */}
      <header className="h-10 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <span className="text-sm font-medium text-primary">Myika</span>
        <button
          onClick={() => setShowSettings(true)}
          className="text-muted hover:text-primary transition-colors text-sm"
        >
          Settings
        </button>
      </header>

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Chat - flex grow */}
        <main className="flex-1 min-w-0">
          <Chat />
        </main>

        {/* Right column - fixed width */}
        <aside className="w-[300px] border-l border-[var(--border)] bg-[var(--bg-surface)] flex flex-col">
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            {/* Project tree stub */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Project</h3>
              <div className="text-sm text-muted italic">No project connected</div>
            </section>

            {/* Scope stub */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Scope</h3>
              <div className="text-sm text-muted italic">—</div>
            </section>

            {/* Tools stub */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Tools</h3>
              <div className="space-y-1">
                {["list_assets", "read_file", "write_file", "run_python", "get_compile_errors", "read_blueprint_summary"].map((t) => (
                  <div key={t} className="text-xs font-mono text-muted px-2 py-1 rounded bg-[var(--bg-elevated)]">{t}</div>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>

      {/* Bottom status bar */}
      <footer className="h-7 flex items-center px-4 border-t border-[var(--border)] bg-[var(--bg-surface)] text-xs">
        <BridgeStatus />
      </footer>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
