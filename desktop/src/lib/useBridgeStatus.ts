import { useEffect, useState } from "react";
import { type BridgeStatus, getBridgeStatus, onBridgeStatusChanged, onChatEvent } from "./ipc";

export interface BridgeInfo {
  status: BridgeStatus;
  toolsActive: boolean;
}

export function useBridgeStatus(): BridgeInfo {
  const [status, setStatus] = useState<BridgeStatus>({ status: "disconnected", error: null });
  const [toolsActive, setToolsActive] = useState(false);

  useEffect(() => {
    getBridgeStatus().then(setStatus).catch(() => {});
    let unlisten: (() => void) | undefined;
    onBridgeStatusChanged(setStatus).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onChatEvent((event) => {
      if (event.type === "tool_call") setToolsActive(true);
      if (event.type === "tool_result" || event.type === "assistant_done" || event.type === "error") setToolsActive(false);
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  return { status, toolsActive };
}
