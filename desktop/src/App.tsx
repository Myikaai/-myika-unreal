import Chat from "./components/Chat";
import BridgeStatus from "./components/BridgeStatus";
import Settings from "./components/Settings";
import ToastContainer from "./components/ToastContainer";
import Icon from "./components/Icon";
import { useState } from "react";
import { useBridgeStatus } from "./lib/useBridgeStatus";

const TOOLS = [
  { name: "list_assets", icon: "search" },
  { name: "read_file", icon: "read" },
  { name: "write_file", icon: "write" },
  { name: "run_python", icon: "code" },
  { name: "get_compile_errors", icon: "diff" },
  { name: "read_blueprint_summary", icon: "plan" },
] as const;

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const bridge = useBridgeStatus();

  const isConnected = bridge.status.status === "connected";
  const projectName = bridge.status.status === "connected" ? bridge.status.project_name : null;
  const ueVersion = bridge.status.status === "connected" ? bridge.status.ue_version : null;

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-base)]">
      {/* Top bar */}
      <header className="h-10 flex items-center justify-between px-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <svg width="16" height="16" aria-hidden="true"><use href="/icons.svg#myika-logo-16" /></svg>
          Myika
        </span>
        <button
          onClick={() => setShowSettings(true)}
          className="text-secondary hover:text-primary transition-colors rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
          style={{ transitionDuration: "var(--duration-default)", transitionTimingFunction: "var(--ease-out)" }}
          title="Settings"
        >
          <Icon name="settings" size={16} />
        </button>
      </header>

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Chat - flex grow */}
        <main className="flex-1 min-w-0">
          <Chat />
        </main>

        {/* Right column - fixed width */}
        <aside className="w-[300px] border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex flex-col">
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            <section>
              <h3 className="font-mono text-muted uppercase mb-2" style={{ fontSize: "10px", letterSpacing: "0.08em", opacity: 0.5 }}>Project</h3>
              {projectName ? (
                <div className="text-sm text-primary">
                  <div className="font-medium">{projectName}</div>
                  <div className="text-xs text-secondary mt-0.5">Unreal Engine {ueVersion}</div>
                </div>
              ) : (
                <div className="text-sm text-muted italic">Not connected</div>
              )}
            </section>

            <section>
              <h3 className="font-mono text-muted uppercase mb-2" style={{ fontSize: "10px", letterSpacing: "0.08em", opacity: 0.5 }}>Scope</h3>
              <div className="text-sm text-secondary">
                {isConnected ? "Full project" : "—"}
              </div>
            </section>

            <section>
              <h3 className="font-mono text-muted uppercase mb-2" style={{ fontSize: "10px", letterSpacing: "0.08em", opacity: 0.5 }}>Tools</h3>
              <div className="space-y-1">
                {TOOLS.map((t) => (
                  <div key={t.name} className="flex items-center gap-1.5 font-mono text-secondary px-2 py-1 rounded bg-[var(--color-bg-elevated)]" style={{ fontSize: "11px" }}>
                    <Icon name={t.icon} size={16} />
                    <span className="truncate">{t.name}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>

      {/* Bottom status bar */}
      <footer className="h-8 flex items-center px-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-xs">
        <BridgeStatus bridge={bridge} />
      </footer>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <ToastContainer />
    </div>
  );
}

export default App;
