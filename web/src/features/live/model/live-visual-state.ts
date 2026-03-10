import type {
  AgentOutputActivity,
  LiveCommandPhase,
  LiveContentState,
  LiveTransportStatus,
  LiveVisualState,
} from "~/features/live/types/live-types";
import type { AudioMachineMode } from "~/features/live-control-bar/model/control-bar-audio-machine";

const RECENT_AGENT_ACTIVITY_WINDOW_MS = 4_000;
const RECENT_USER_DELIVERED_WINDOW_MS = 12_000;

interface ResolveVisualStateParams {
  agentOnline: boolean | undefined;
  audioMode: AudioMachineMode;
  commandPhase: LiveCommandPhase;
  contentState: LiveContentState;
  errorMessage: string | null;
  lastAgentOutput: AgentOutputActivity | null;
  lastUserDeliveredAt: number | null;
  liveMode: boolean;
  now: number;
  transportStatus: LiveTransportStatus;
}

export function resolveLiveVisualState({
  agentOnline,
  audioMode,
  commandPhase,
  contentState,
  errorMessage,
  lastAgentOutput,
  lastUserDeliveredAt,
  liveMode,
  now,
  transportStatus,
}: ResolveVisualStateParams): LiveVisualState {
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

  const hasRecentAgentActivity =
    typeof lastAgentOutput?.at === "number" &&
    lastAgentOutput.kind !== "track" &&
    now - lastAgentOutput.at <= RECENT_AGENT_ACTIVITY_WINDOW_MS;
  if (hasRecentAgentActivity) return "agent-replying";

  const isWaitingForAgentReply =
    typeof lastUserDeliveredAt === "number" &&
    now - lastUserDeliveredAt <= RECENT_USER_DELIVERED_WINDOW_MS &&
    (typeof lastAgentOutput?.at !== "number" || lastAgentOutput.at < lastUserDeliveredAt);
  if (isWaitingForAgentReply) return "agent-thinking";

  if (contentState === "loading") return "content-loading";
  if (contentState === "empty") return "waiting-content";
  if (errorMessage) return "error";

  return "idle";
}
