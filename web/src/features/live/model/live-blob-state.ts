import type { LiveAgentActivity } from "@shared/live-runtime-state-core";
import type {
  LiveBlobState,
  LiveCommandPhase,
  LiveContentState,
  LiveTransportStatus,
} from "~/features/live/types/live-types";
import type { AudioMachineMode } from "~/features/live-control-bar/model/control-bar-audio-machine";

interface ResolveBlobStateParams {
  agentActivity: LiveAgentActivity;
  agentOnline: boolean | undefined;
  audioMode: AudioMachineMode;
  commandPhase: LiveCommandPhase;
  contentState: LiveContentState;
  errorMessage: string | null;
  liveMode: boolean;
  transportStatus: LiveTransportStatus;
}

export function resolveLiveBlobState({
  agentActivity,
  agentOnline,
  audioMode,
  commandPhase,
  contentState,
  errorMessage,
  liveMode,
  transportStatus,
}: ResolveBlobStateParams): LiveBlobState {
  if (!liveMode) {
    if (contentState === "loading") return "content-loading";
    if (contentState === "empty") return "waiting-content";
    return "idle";
  }

  if (agentOnline === false) return "offline";
  if (transportStatus === "connecting") return "connecting";
  if (transportStatus === "disconnected") return "disconnected";

  if (
    audioMode === "starting-recording" ||
    audioMode === "recording" ||
    audioMode === "recording-paused" ||
    audioMode === "stopping-recording"
  ) {
    return "recording";
  }

  if (
    audioMode === "starting-voice" ||
    audioMode === "voice-mode" ||
    audioMode === "stopping-voice"
  ) {
    return "voice-mode";
  }

  if (commandPhase === "running" || commandPhase === "canceling") return "command-running";

  if (agentActivity === "streaming") return "agent-replying";
  if (agentActivity === "thinking") return "agent-thinking";

  if (contentState === "loading") return "content-loading";
  if (contentState === "empty") return "waiting-content";
  if (errorMessage) return "error";

  return "idle";
}
