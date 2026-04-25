import { useEffect, useState } from "react";
import { type BridgeStatus as BridgeStatusType, getBridgeStatus, onBridgeStatusChanged, reconnectBridge } from "../lib/ipc";

export default function BridgeStatus() {
  const [status, setStatus] = useState<BridgeStatusType>({ status: "disconnected", error: null });

  useEffect(() => {
    getBridgeStatus().then(setStatus).catch(() => {});
    const unlisten = onBridgeStatusChanged(setStatus);
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  switch (status.status) {
    case "connected":
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-muted">Connected · {status.project_name} · {status.ue_version}</span>
        </div>
      );
    case "connecting":
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-muted">Connecting · attempt {status.attempt}/∞</span>
        </div>
      );
    case "disconnected":
    default:
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-muted">
            Disconnected{status.status === "disconnected" && status.error ? ` · ${status.error}` : ""}
          </span>
          <button
            onClick={() => reconnectBridge()}
            className="ml-2 px-2 py-0.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--bg-elevated)] text-muted hover:text-primary transition-colors"
          >
            Reconnect
          </button>
        </div>
      );
  }
}
