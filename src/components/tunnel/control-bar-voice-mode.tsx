import { Square } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface ControlBarVoiceModeProps {
  actionButtonClass: string;
  actionIconClass: string;
  controlBarClass: string;
  controlHeightClass: string;
  elapsedLabel: string;
  onStopVoiceMode: () => void;
  recordingToneClass: string;
  waveformEl: ReactNode;
}

export function ControlBarVoiceMode({
  actionButtonClass,
  actionIconClass,
  controlBarClass,
  controlHeightClass,
  elapsedLabel,
  onStopVoiceMode,
  recordingToneClass,
  waveformEl,
}: ControlBarVoiceModeProps) {
  return (
    <div className={cn(controlBarClass, controlHeightClass, recordingToneClass)}>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-destructive/12 px-3 py-2">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
        <span className="text-sm font-semibold">{elapsedLabel}</span>
        {waveformEl}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">Voice streaming</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(actionButtonClass, "text-destructive")}
        onClick={onStopVoiceMode}
        aria-label="Stop voice mode"
      >
        <Square className={actionIconClass} />
      </Button>
    </div>
  );
}
