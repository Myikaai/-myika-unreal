import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type BridgeStatus =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; project_name: string; ue_version: string };

export async function getBridgeStatus(): Promise<BridgeStatus> {
  return invoke("get_bridge_status");
}

export function onBridgeStatusChanged(callback: (status: BridgeStatus) => void) {
  return listen<BridgeStatus>("bridge-status-changed", (event) => callback(event.payload));
}
