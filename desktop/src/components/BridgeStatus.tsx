import { reconnectBridge } from "../lib/ipc";
import { type BridgeInfo } from "../lib/useBridgeStatus";

interface Props {
  bridge: BridgeInfo;
}

export default function BridgeStatus({ bridge }: Props) {
  const { status, toolsActive } = bridge;
  const isConnected = status.status === "connected";
  const isConnecting = status.status === "connecting";

  const indicatorClass = isConnected
    ? (toolsActive ? "bridge-indicator--active" : "bridge-indicator--idle")
    : isConnecting
      ? "bridge-indicator--active"
      : "bridge-indicator--disconnected";

  const label = isConnected
    ? `${status.project_name} · ${status.ue_version}`
    : isConnecting
      ? `Connecting · attempt ${status.attempt}`
      : `Disconnected${status.status === "disconnected" && status.error ? ` · ${status.error}` : ""}`;

  return (
    <div className="flex items-center gap-2 flex-1">
      {/* Left: indicator + project info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={`bridge-indicator ${indicatorClass}`}>
          <div className="bridge-indicator__core" />
          {(isConnected || isConnecting) && <div className="bridge-indicator__ring" />}
        </div>
        <span className="text-secondary truncate" style={{ fontFeatureSettings: "'tnum'", fontSize: "11px" }}>
          {label}
        </span>
      </div>

      {/* Right: model + reconnect */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {isConnected && (
          <span className="text-muted" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}>
            {toolsActive ? "Working..." : "Ready"}
          </span>
        )}
        {!isConnected && !isConnecting && (
          <button
            onClick={() => reconnectBridge()}
            className="px-2 py-0.5 text-xs border border-[var(--color-border-default)] rounded hover:bg-[var(--color-bg-elevated)] text-secondary hover:text-primary active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
            style={{ transitionDuration: "var(--duration-default)", transitionTimingFunction: "var(--ease-out)" }}
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
