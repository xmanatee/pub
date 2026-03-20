import { Square } from "lucide-react";
import type { ReactNode } from "react";
import { ControlBarIconAction, ControlBarPanel } from "~/components/control-bar/control-bar-parts";
import { CONTROL_BAR_STYLES } from "~/components/control-bar/control-bar-styles";

interface ControlBarVoiceModeProps {
  elapsedLabel: string;
  onStopVoiceMode: () => void;
  waveformEl: ReactNode;
}

export function ControlBarVoiceMode({
  elapsedLabel,
  onStopVoiceMode,
  waveformEl,
}: ControlBarVoiceModeProps) {
  return (
    <ControlBarPanel className={CONTROL_BAR_STYLES.recordingTone}>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-destructive/12 px-3 py-2">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
        <span className="text-sm font-semibold">{elapsedLabel}</span>
        {waveformEl}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">Voice streaming</span>
      <ControlBarIconAction
        className="text-destructive"
        icon={<Square />}
        label="Stop voice mode"
        onClick={onStopVoiceMode}
      />
    </ControlBarPanel>
  );
}
