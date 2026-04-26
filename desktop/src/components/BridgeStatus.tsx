import { useEffect, useState } from "react";
import { type BridgeStatus as BridgeStatusType, getBridgeStatus, onBridgeStatusChanged, reconnectBridge } from "../lib/ipc";

export default function BridgeStatus() {
  const [status, setStatus] = useState<BridgeStatusType>({ status: "disconnected", error: null });

  useEffect(() => {
    getBridgeStatus().then(setStatus).catch(() => {});
    const unlisten = onBridgeStatusChanged(setStatus);
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const isConnected = status.status === "connected";
  const isConnecting = status.status === "connecting";

  // Determine indicator state class
  const indicatorClass = isConnected
    ? "bridge-indicator--idle"
    : isConnecting
      ? "bridge-indicator--active"
      : "bridge-indicator--disconnected";

  const label = isConnected
    ? `${status.project_name} · ${status.ue_version}`
    : isConnecting
      ? `Connecting · attempt ${status.attempt}/∞`
      : `Disconnected${status.status === "disconnected" && status.error ? ` · ${status.error}` : ""}`;

  return (
    <div className="flex items-center gap-2">
      <div className={`bridge-indicator ${indicatorClass}`}>
        <div className="bridge-indicator__core" />
        {(isConnected || isConnecting) && <div className="bridge-indicator__ring" />}
      </div>
      <span className="text-secondary" style={{ fontFeatureSettings: "'tnum'" }}>{label}</span>
      {!isConnected && !isConnecting && (
        <button
          onClick={() => reconnectBridge()}
          className="ml-2 px-2 py-0.5 text-xs border border-[var(--color-border-default)] rounded hover:bg-[var(--color-bg-elevated)] text-secondary hover:text-primary active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
          style={{ transitionDuration: "var(--duration-fast)" }}
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
