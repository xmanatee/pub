import { Square } from "lucide-react";
import type { ReactNode } from "react";
import {
  ControlBarChip,
  ControlBarIconAction,
  ControlBarPanel,
} from "~/components/control-bar/control-bar-parts";

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
    <ControlBarPanel>
      <ControlBarChip className="bg-destructive/12">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
        <span className="text-sm font-semibold">{elapsedLabel}</span>
        <div className="hidden min-w-0 flex-1 sm:block">{waveformEl}</div>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          Voice streaming
        </span>
      </ControlBarChip>
      <ControlBarIconAction
        className="text-destructive"
        icon={<Square />}
        label="Stop voice mode"
        onClick={onStopVoiceMode}
      />
    </ControlBarPanel>
  );
}
