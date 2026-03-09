export type LiveViewMode = "canvas" | "chat" | "settings";
export type {
  CanvasBridgeCommandMessage,
  CanvasBridgeInboundMessage,
  CanvasBridgeOutboundMessage,
} from "./live-command-types";

export interface LiveRenderErrorPayload {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

export type SessionState = "inactive" | "active" | "needs-takeover" | "taken-over";

export type LiveVisualState =
  | "connecting"
  | "disconnected"
  | "waiting-content"
  | "idle"
  | "agent-thinking"
  | "agent-replying";
