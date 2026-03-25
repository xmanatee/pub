import { LayoutDashboard, Play } from "lucide-react";
import {
  ControlBarIconAction,
  ControlBarLabel,
  ControlBarPanel,
} from "~/components/control-bar/control-bar-parts";

interface ControlBarOptionalLiveModeProps {
  agentOnline: boolean;
  onConnect: () => void;
  onExit: () => void;
}

export function ControlBarOptionalLiveMode({
  agentOnline,
  onConnect,
  onExit,
}: ControlBarOptionalLiveModeProps) {
  return (
    <ControlBarPanel>
      <ControlBarLabel>
        {agentOnline ? "Connect an agent to start live" : "Agent offline"}
      </ControlBarLabel>
      <ControlBarIconAction
        icon={<LayoutDashboard />}
        label="Pubs"
        onClick={onExit}
        tooltip="Pubs"
      />
      <ControlBarIconAction
        icon={<Play />}
        label="Connect agent"
        onClick={onConnect}
        tooltip="Connect agent"
        variant="default"
        disabled={!agentOnline}
      />
    </ControlBarPanel>
  );
}
