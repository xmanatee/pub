import { LayoutDashboard, RefreshCw } from "lucide-react";
import {
  ControlBarIconAction,
  ControlBarLabel,
  ControlBarPanel,
} from "~/components/control-bar/control-bar-parts";

interface ControlBarDisconnectedModeProps {
  onExit: () => void;
  onReconnect: () => void;
}

export function ControlBarDisconnectedMode({
  onExit,
  onReconnect,
}: ControlBarDisconnectedModeProps) {
  return (
    <ControlBarPanel>
      <ControlBarLabel>Connection lost</ControlBarLabel>
      <ControlBarIconAction
        icon={<LayoutDashboard />}
        label="Dashboard"
        onClick={onExit}
        tooltip="Dashboard"
      />
      <ControlBarIconAction
        icon={<RefreshCw />}
        label="Reconnect"
        onClick={onReconnect}
        tooltip="Reconnect"
        variant="default"
      />
    </ControlBarPanel>
  );
}
