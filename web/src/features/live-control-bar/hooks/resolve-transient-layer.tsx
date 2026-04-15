import type { ReactNode } from "react";
import type { ControlBarLayerInput } from "~/components/control-bar/control-bar-types";
import type { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { ControlBarAgentSelectionMode } from "../components/control-bar-agent-selection-mode";
import { ControlBarBusyMode } from "../components/control-bar-busy-mode";
import { ControlBarDisconnectedMode } from "../components/control-bar-disconnected-mode";
import { ControlBarOfflineMode } from "../components/control-bar-offline-mode";
import { ControlBarRecordingMode } from "../components/control-bar-recording-mode";
import { ControlBarTakeoverMode } from "../components/control-bar-takeover-mode";
import { ControlBarVoiceMode } from "../components/control-bar-voice-mode";

const RECORDING_SHELL_CLASS = "border-destructive/40 bg-background/88";

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

interface ResolveTransientLayerInput {
  agents: ReturnType<typeof useLiveSession>["availableAgents"];
  controlBarState: ReturnType<typeof useLiveSession>["controlBarState"];
  defaultAgentName: string | null;
  elapsed: number;
  lastTakeoverAt: number | undefined;
  onCancelRecording: () => void;
  onExit: () => void;
  onPauseResume: () => void;
  onReconnect: () => void;
  onSelectAgent: ReturnType<typeof useLiveSession>["setSelectedHostId"];
  onSendRecording: () => void;
  onSetDefaultAgent: (name: string | null) => void;
  onStopVoiceMode: () => void;
  onTakeover: ReturnType<typeof useLiveSession>["takeoverLive"];
  rightAction?: ReactNode;
  waveform: ReactNode;
}

/**
 * Maps a transient `controlBarState` (recording, voice, takeover, …) to the
 * partial layer that should override the live input row. Returns null while idle.
 */
export function resolveTransientLayer({
  agents,
  controlBarState,
  defaultAgentName,
  elapsed,
  lastTakeoverAt,
  onCancelRecording,
  onExit,
  onPauseResume,
  onReconnect,
  onSelectAgent,
  onSendRecording,
  onSetDefaultAgent,
  onStopVoiceMode,
  onTakeover,
  rightAction,
  waveform,
}: ResolveTransientLayerInput): Omit<ControlBarLayerInput, "priority"> | null {
  switch (controlBarState) {
    case "idle":
    case "connecting":
      return null;

    case "agent-selection":
      return {
        rightAction,
        mainContent: (
          <ControlBarAgentSelectionMode
            agents={agents}
            defaultAgentName={defaultAgentName}
            onExit={onExit}
            onSelect={onSelectAgent}
            onSetDefault={onSetDefaultAgent}
          />
        ),
      };

    case "offline":
      return { rightAction, mainContent: <ControlBarOfflineMode onExit={onExit} /> };

    case "disconnected":
      return {
        rightAction,
        mainContent: <ControlBarDisconnectedMode onExit={onExit} onReconnect={onReconnect} />,
      };

    case "needs-takeover":
    case "taken-over":
      return {
        rightAction,
        mainContent: (
          <ControlBarTakeoverMode
            lastTakeoverAt={lastTakeoverAt}
            onExit={onExit}
            onTakeover={onTakeover}
            sessionState={controlBarState}
          />
        ),
      };

    case "starting-recording":
      return { rightAction, mainContent: <ControlBarBusyMode label="Starting recording..." /> };

    case "stopping-recording":
      return { rightAction, mainContent: <ControlBarBusyMode label="Finishing recording..." /> };

    case "recording":
    case "recording-paused":
      return {
        rightAction,
        className: RECORDING_SHELL_CLASS,
        mainContent: (
          <ControlBarRecordingMode
            elapsedLabel={formatTime(elapsed)}
            isPaused={controlBarState === "recording-paused"}
            onCancelRecording={onCancelRecording}
            onPauseResume={onPauseResume}
            onSendRecording={onSendRecording}
            waveformEl={waveform}
          />
        ),
      };

    case "starting-voice":
      return { rightAction, mainContent: <ControlBarBusyMode label="Starting voice mode..." /> };

    case "stopping-voice":
      return { rightAction, mainContent: <ControlBarBusyMode label="Stopping voice mode..." /> };

    case "voice-mode":
      return {
        rightAction,
        className: RECORDING_SHELL_CLASS,
        mainContent: (
          <ControlBarVoiceMode
            elapsedLabel={formatTime(elapsed)}
            onStopVoiceMode={onStopVoiceMode}
            waveformEl={waveform}
          />
        ),
      };
  }
}
