import { Pause, Play, Send, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";

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
    <div className={cn(CB.controlBar, CB.controlHeight, CB.recordingTone)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="control"
            className={cn(CB.actionButton, "text-destructive")}
            onClick={onCancelRecording}
            aria-label="Delete recording"
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete recording</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-destructive/12 px-3 py-2">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            isPaused ? "bg-muted-foreground" : "animate-pulse bg-destructive",
          )}
        />
        <span className="text-sm font-semibold">{elapsedLabel}</span>
        <div className={cn("min-w-0 flex-1", isPaused ? "opacity-45" : "opacity-100")}>
          {waveformEl}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {isPaused ? "Paused" : "Recording"}
        </span>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="control"
            className={CB.actionButton}
            onClick={onPauseResume}
            aria-label={isPaused ? "Resume recording" : "Pause recording"}
          >
            {isPaused ? <Play /> : <Pause />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isPaused ? "Resume" : "Pause"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="default"
            size="control"
            className={CB.actionButton}
            onClick={onSendRecording}
            aria-label="Send recording"
          >
            <Send />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Send recording</TooltipContent>
      </Tooltip>
    </div>
  );
}
