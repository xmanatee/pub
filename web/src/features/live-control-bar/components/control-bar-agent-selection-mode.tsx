import type { Id } from "@backend/_generated/dataModel";
import { LayoutDashboard, Play } from "lucide-react";
import { useState } from "react";
import {
  ControlBarIconAction,
  ControlBarPanel,
  ControlBarSelect,
  ControlBarTextAction,
} from "~/components/control-bar/control-bar-parts";

interface AgentInfo {
  hostId: Id<"hosts">;
  agentName: string;
}

interface ControlBarAgentSelectionModeProps {
  agents: AgentInfo[];
  onExit: () => void;
  onSelect: (hostId: Id<"hosts">) => void;
}

export function ControlBarAgentSelectionMode({
  agents,
  onExit,
  onSelect,
}: ControlBarAgentSelectionModeProps) {
  if (agents.length === 2) {
    return <TwoAgentLayout agents={agents} onExit={onExit} onSelect={onSelect} />;
  }
  return <MultiAgentLayout agents={agents} onExit={onExit} onSelect={onSelect} />;
}

function TwoAgentLayout({ agents, onExit, onSelect }: ControlBarAgentSelectionModeProps) {
  return (
    <ControlBarPanel>
      {agents.map((agent) => (
        <ControlBarTextAction key={agent.hostId} onClick={() => onSelect(agent.hostId)}>
          {agent.agentName}
        </ControlBarTextAction>
      ))}

      <DashboardButton onExit={onExit} />
    </ControlBarPanel>
  );
}

function MultiAgentLayout({ agents, onExit, onSelect }: ControlBarAgentSelectionModeProps) {
  const [selected, setSelected] = useState<Id<"hosts"> | "">("");

  return (
    <ControlBarPanel>
      <ControlBarSelect
        value={selected}
        onChange={(e) => setSelected(e.target.value as Id<"hosts">)}
      >
        <option value="" disabled>
          Select agent...
        </option>
        {agents.map((agent) => (
          <option key={agent.hostId} value={agent.hostId}>
            {agent.agentName}
          </option>
        ))}
      </ControlBarSelect>

      <ControlBarIconAction
        icon={<Play />}
        label="Start live"
        onClick={() => onSelect(selected as Id<"hosts">)}
        disabled={!selected}
        tooltip="Start live"
        variant="default"
      />

      <DashboardButton onExit={onExit} />
    </ControlBarPanel>
  );
}

function DashboardButton({ onExit }: { onExit: () => void }) {
  return (
    <ControlBarIconAction
      icon={<LayoutDashboard />}
      label="Dashboard"
      onClick={onExit}
      tooltip="Dashboard"
    />
  );
}
