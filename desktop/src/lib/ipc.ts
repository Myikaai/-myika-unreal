import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// --- Bridge ---

export type BridgeStatus =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; project_name: string; ue_version: string };

export async function getBridgeStatus(): Promise<BridgeStatus> {
  return invoke("get_bridge_status");
}

export function onBridgeStatusChanged(callback: (status: BridgeStatus) => void): Promise<UnlistenFn> {
  return listen<BridgeStatus>("bridge-status-changed", (event) => callback(event.payload));
}

// --- Settings ---

export interface AppSettings {
  provider: string;
  model: string;
  bridge_port: number;
  trust_mode: boolean;
}

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

// --- Chat ---

export type ChatEvent =
  | { type: "assistant_text"; text: string }
  | { type: "assistant_done"; full_text: string }
  | { type: "tool_call"; name: string; args: string }
  | { type: "tool_result"; name: string; result: string }
  | { type: "plan_proposed"; steps: string[]; summary: string }
  | { type: "error"; message: string };

export async function sendMessage(message: string): Promise<string> {
  return invoke("send_message", { message });
}

export async function clearChat(): Promise<void> {
  return invoke("clear_chat");
}

export async function resolvePlan(approved: boolean): Promise<void> {
  return invoke("resolve_plan", { approved });
}

export function onChatEvent(callback: (event: ChatEvent) => void): Promise<UnlistenFn> {
  return listen<ChatEvent>("chat-event", (event) => callback(event.payload));
}
