import type { LiveConnectionState } from "@shared/live-runtime-state-core";
import { resolveLiveBlobState } from "~/features/live/model/live-blob-state";
import type {
  AgentOutputActivity,
  LiveBlobState,
  LiveCommandSummary,
  LiveContentState,
  LiveControlBarState,
  LiveErrorSummary,
  LiveTransportStatus,
  SessionState,
} from "~/features/live/types/live-types";
import type { AudioMachineMode } from "~/features/live-control-bar/model/control-bar-audio-machine";

export interface PubViewSourceState {
  agentOnline: boolean | undefined;
  audioMode: AudioMachineMode;
  command: LiveCommandSummary;
  connectionState: LiveConnectionState;
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
  blobState: LiveBlobState;
  controlBarState: LiveControlBarState;
  error: LiveErrorSummary;
  transportStatus: LiveTransportStatus;
}

export function resolveTransportStatus({
  agentOnline,
  connectionState,
  liveMode,
  sessionState,
}: Pick<
  PubViewSourceState,
  "agentOnline" | "connectionState" | "liveMode" | "sessionState"
>): LiveTransportStatus {
  if (!liveMode) return "disabled";
  if (agentOnline === undefined) return "connecting";
  if (agentOnline !== true) return "disabled";
  if (sessionState === "needs-takeover" || sessionState === "taken-over") return "disabled";
  if (connectionState === "connected") return "connected";
  if (connectionState === "failed" || connectionState === "disconnected") return "disconnected";
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
  command,
  sessionError,
}: Pick<PubViewSourceState, "command" | "sessionError">): LiveErrorSummary {
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

/**
 * Exhaustive check: only "idle" and "connecting" allow collapse.
 * New LiveControlBarState values will cause a compile error here,
 * forcing a deliberate decision on collapsibility.
 */
export function isControlBarCollapsible(state: LiveControlBarState): boolean {
  switch (state) {
    case "idle":
    case "connecting":
      return true;
    case "agent-selection":
    case "offline":
    case "needs-takeover":
    case "taken-over":
    case "disconnected":
    case "starting-recording":
    case "recording":
    case "recording-paused":
    case "stopping-recording":
    case "starting-voice":
    case "voice-mode":
    case "stopping-voice":
      return false;
  }
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
  const blobState = resolveLiveBlobState({
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
    blobState,
    controlBarState,
    error,
    transportStatus,
  };
}
