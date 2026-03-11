import type { BridgeState } from "~/features/live/lib/webrtc-browser";
import { resolveLiveVisualState } from "~/features/live/model/live-visual-state";
import type {
  AgentOutputActivity,
  LiveCommandSummary,
  LiveContentState,
  LiveControlBarState,
  LiveErrorSummary,
  LiveTransportStatus,
  LiveVisualState,
  SessionState,
} from "~/features/live/types/live-types";
import type { AudioMachineMode } from "~/features/live-control-bar/model/control-bar-audio-machine";

export interface PubViewSourceState {
  agentOnline: boolean | undefined;
  audioMode: AudioMachineMode;
  bridgeState: BridgeState;
  canvasError: string | null;
  command: LiveCommandSummary;
  contentState: LiveContentState;
  lastAgentOutput: AgentOutputActivity | null;
  lastUserDeliveredAt: number | null;
  liveMode: boolean;
  needsAgentSelection: boolean;
  now: number;
  sessionError: string | null;
  sessionState: SessionState;
}

export interface PubViewState {
  controlBarState: LiveControlBarState;
  error: LiveErrorSummary;
  transportStatus: LiveTransportStatus;
  visualState: LiveVisualState;
}

export function resolveTransportStatus({
  agentOnline,
  bridgeState,
  liveMode,
  sessionState,
}: Pick<
  PubViewSourceState,
  "agentOnline" | "bridgeState" | "liveMode" | "sessionState"
>): LiveTransportStatus {
  if (!liveMode) return "disabled";
  if (agentOnline === undefined) return "connecting";
  if (agentOnline !== true) return "disabled";
  if (sessionState === "needs-takeover" || sessionState === "taken-over") return "disabled";
  if (bridgeState === "connected") return "connected";
  if (bridgeState === "disconnected" || bridgeState === "closed") return "disconnected";
  return "connecting";
}

export function resolveControlBarState(
  source: Pick<
    PubViewSourceState,
    "agentOnline" | "audioMode" | "liveMode" | "needsAgentSelection" | "sessionState"
  > & {
    transportStatus: LiveTransportStatus;
  },
): LiveControlBarState {
  if (!source.liveMode) return "idle";
  if (source.agentOnline === false) return "offline";
  if (source.needsAgentSelection) return "agent-selection";
  if (source.sessionState === "needs-takeover") return "needs-takeover";
  if (source.sessionState === "taken-over") return "taken-over";
  if (source.audioMode === "starting-recording") return "starting-recording";
  if (source.audioMode === "recording") return "recording";
  if (source.audioMode === "recording-paused") return "recording-paused";
  if (source.audioMode === "stopping-recording") return "stopping-recording";
  if (source.audioMode === "starting-voice") return "starting-voice";
  if (source.audioMode === "voice-mode") return "voice-mode";
  if (source.audioMode === "stopping-voice") return "stopping-voice";
  if (source.transportStatus === "disconnected") return "disconnected";
  if (source.transportStatus === "connecting") return "connecting";
  return "idle";
}

export function resolveLiveErrorSummary({
  canvasError,
  command,
  sessionError,
}: Pick<PubViewSourceState, "canvasError" | "command" | "sessionError">): LiveErrorSummary {
  if (canvasError) {
    return {
      message: canvasError,
      source: "canvas",
    };
  }
  if (command.phase === "failed" && command.errorMessage) {
    return {
      message: command.errorMessage,
      source: "command",
    };
  }
  if (sessionError) {
    return {
      message: sessionError,
      source: "session",
    };
  }
  return {
    message: null,
    source: "none",
  };
}

export function derivePubViewState(source: PubViewSourceState): PubViewState {
  const transportStatus = resolveTransportStatus(source);
  const controlBarState = resolveControlBarState({
    liveMode: source.liveMode,
    agentOnline: source.agentOnline,
    audioMode: source.audioMode,
    needsAgentSelection: source.needsAgentSelection,
    sessionState: source.sessionState,
    transportStatus,
  });
  const error = resolveLiveErrorSummary(source);
  const visualState = resolveLiveVisualState({
    agentOnline: source.agentOnline,
    audioMode: source.audioMode,
    commandPhase: source.command.phase,
    contentState: source.contentState,
    errorMessage: error.message,
    lastAgentOutput: source.lastAgentOutput,
    lastUserDeliveredAt: source.lastUserDeliveredAt,
    liveMode: source.liveMode,
    now: source.now,
    transportStatus,
  });

  return {
    controlBarState,
    error,
    transportStatus,
    visualState,
  };
}
