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

export type LiveContentState = "loading" | "ready" | "empty";

export type LiveTransportStatus = "disabled" | "connecting" | "connected" | "disconnected";

export type LiveCommandPhase = "idle" | "running" | "canceling" | "succeeded" | "failed";

export interface LiveCommandSummary {
  activeCallId: string | null;
  activeCommandName: string | null;
  activeCount: number;
  errorMessage: string | null;
  finishedAt: number | null;
  phase: LiveCommandPhase;
}

export interface LiveErrorSummary {
  message: string | null;
  source: "none" | "command" | "session";
}

export type LiveControlBarState =
  | "agent-selection"
  | "offline"
  | "connecting"
  | "disconnected"
  | "needs-takeover"
  | "taken-over"
  | "starting-recording"
  | "recording"
  | "recording-paused"
  | "stopping-recording"
  | "starting-voice"
  | "voice-mode"
  | "stopping-voice"
  | "idle";

export type LiveBlobState =
  | "content-loading"
  | "offline"
  | "connecting"
  | "disconnected"
  | "waiting-content"
  | "idle"
  | "agent-thinking"
  | "agent-replying"
  | "recording"
  | "voice-mode"
  | "command-running"
  | "error";
