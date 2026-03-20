import { Pause, Play, Send, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  ControlBarChip,
  ControlBarIconAction,
  ControlBarPanel,
} from "~/components/control-bar/control-bar-parts";
import { cn } from "~/lib/utils";

interface ControlBarRecordingModeProps {
  elapsedLabel: string;
  isPaused: boolean;
  onCancelRecording: () => void;
  onPauseResume: () => void;
  onSendRecording: () => void;
  waveformEl: ReactNode;
}

export function ControlBarRecordingMode({
  elapsedLabel,
  isPaused,
  onCancelRecording,
  onPauseResume,
  onSendRecording,
  waveformEl,
}: ControlBarRecordingModeProps) {
  return (
    <ControlBarPanel>
      <ControlBarIconAction
        className="text-destructive"
        icon={<Trash2 />}
        label="Delete recording"
        onClick={onCancelRecording}
        tooltip="Delete recording"
      />

      <ControlBarChip className="bg-destructive/12">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            isPaused ? "bg-muted-foreground" : "animate-pulse bg-destructive",
          )}
        />
        <span className="text-sm font-semibold">{elapsedLabel}</span>
        <div
          className={cn("hidden min-w-0 flex-1 sm:block", isPaused ? "opacity-45" : "opacity-100")}
        >
          {waveformEl}
        </div>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {isPaused ? "Paused" : "Recording"}
        </span>
      </ControlBarChip>

      <ControlBarIconAction
        icon={isPaused ? <Play /> : <Pause />}
        label={isPaused ? "Resume recording" : "Pause recording"}
        onClick={onPauseResume}
        tooltip={isPaused ? "Resume" : "Pause"}
      />
      <ControlBarIconAction
        icon={<Send />}
        label="Send recording"
        onClick={onSendRecording}
        tooltip="Send recording"
        variant="default"
      />
    </ControlBarPanel>
  );
}
