import { LayoutDashboard } from "lucide-react";
import {
  ControlBarIconAction,
  ControlBarLabel,
  ControlBarPanel,
} from "~/components/control-bar/control-bar-parts";

interface ControlBarOfflineModeProps {
  onExit: () => void;
}

export function ControlBarOfflineMode({ onExit }: ControlBarOfflineModeProps) {
  return (
    <ControlBarPanel>
      <ControlBarLabel>Agent offline</ControlBarLabel>
      <ControlBarIconAction
        icon={<LayoutDashboard />}
        label="Pubs"
        onClick={onExit}
        tooltip="Pubs"
      />
    </ControlBarPanel>
  );
}
