import { useEffect, useState } from "react";
import { type BridgeStatus as BridgeStatusType, getBridgeStatus, onBridgeStatusChanged } from "../lib/ipc";

export default function BridgeStatus() {
  const [status, setStatus] = useState<BridgeStatusType>({ status: "disconnected" });

  useEffect(() => {
    // Fetch initial status on mount
    getBridgeStatus().then(setStatus).catch(() => {});

    // Listen for status changes
    const unlisten = onBridgeStatusChanged(setStatus);

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  let dotColor: string;
  let label: string;

  switch (status.status) {
    case "connected":
      dotColor = "bg-green-500";
      label = `Connected to UE: ${status.project_name}`;
      break;
    case "connecting":
      dotColor = "bg-yellow-500";
      label = "Connecting...";
      break;
    case "disconnected":
    default:
      dotColor = "bg-red-500";
      label = "Disconnected";
      break;
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span className="text-muted">{label}</span>
    </div>
  );
}
