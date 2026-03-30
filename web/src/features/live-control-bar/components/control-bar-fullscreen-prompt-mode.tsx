import { Maximize, X } from "lucide-react";
import {
  ControlBarIconAction,
  ControlBarLabel,
  ControlBarPanel,
} from "~/components/control-bar/control-bar-parts";

interface ControlBarFullscreenPromptModeProps {
  onDismiss: () => void;
  onFullscreen: () => void;
}

export function ControlBarFullscreenPromptMode({
  onDismiss,
  onFullscreen,
}: ControlBarFullscreenPromptModeProps) {
  return (
    <ControlBarPanel>
      <ControlBarLabel>Enter fullscreen?</ControlBarLabel>
      <ControlBarIconAction icon={<X />} label="Dismiss" onClick={onDismiss} tooltip="Dismiss" />
      <ControlBarIconAction
        icon={<Maximize />}
        label="Fullscreen"
        onClick={onFullscreen}
        tooltip="Enter fullscreen"
        variant="default"
      />
    </ControlBarPanel>
  );
}
