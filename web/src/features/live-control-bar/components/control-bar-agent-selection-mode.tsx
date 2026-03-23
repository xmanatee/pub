import type { Id } from "@backend/_generated/dataModel";
import { LayoutDashboard, Play } from "lucide-react";
import { useState } from "react";
import {
  ControlBarIconAction,
  ControlBarPanel,
  ControlBarSelect,
  ControlBarTextAction,
} from "~/components/control-bar/control-bar-parts";
import type { AgentInfo } from "~/features/live/model/agent-selection";

interface ControlBarAgentSelectionModeProps {
  agents: AgentInfo[];
  defaultAgentName: string | null;
  onExit: () => void;
  onSelect: (hostId: Id<"hosts">) => void;
  onSetDefault: (name: string | null) => void;
}

export function ControlBarAgentSelectionMode({
  agents,
  defaultAgentName,
  onExit,
  onSelect,
  onSetDefault,
}: ControlBarAgentSelectionModeProps) {
  if (agents.length === 2) {
    return (
      <TwoAgentLayout
        agents={agents}
        defaultAgentName={defaultAgentName}
        onExit={onExit}
        onSelect={onSelect}
        onSetDefault={onSetDefault}
      />
    );
  }
  return (
    <MultiAgentLayout
      agents={agents}
      defaultAgentName={defaultAgentName}
      onExit={onExit}
      onSelect={onSelect}
      onSetDefault={onSetDefault}
    />
  );
}

function TwoAgentLayout({
  agents,
  defaultAgentName,
  onExit,
  onSelect,
  onSetDefault,
}: ControlBarAgentSelectionModeProps) {
  const [selected, setSelected] = useState<Id<"hosts"> | null>(null);
  const selectedName = selected ? agents.find((a) => a.hostId === selected)?.agentName : null;

  function handleStart() {
    if (!selected || !selectedName) return;
    onSetDefault(selectedName);
    onSelect(selected);
  }

  return (
    <ControlBarPanel>
      {agents.map((agent) => (
        <ControlBarTextAction
          key={agent.hostId}
          onClick={() => setSelected(agent.hostId)}
          className={selected === agent.hostId ? "bg-accent" : ""}
        >
          {agent.agentName}
          {agent.agentName === defaultAgentName ? " \u2605" : ""}
        </ControlBarTextAction>
      ))}

      <ControlBarIconAction
        icon={<Play />}
        label="Start live"
        onClick={handleStart}
        disabled={!selected}
        tooltip="Start live"
        variant="default"
      />
      <DashboardButton onExit={onExit} />
    </ControlBarPanel>
  );
}

function MultiAgentLayout({
  agents,
  defaultAgentName,
  onExit,
  onSelect,
  onSetDefault,
}: ControlBarAgentSelectionModeProps) {
  const [selected, setSelected] = useState<Id<"hosts"> | "">("");
  const selectedName = selected ? agents.find((a) => a.hostId === selected)?.agentName : undefined;

  function handleStart() {
    if (!selected || !selectedName) return;
    onSetDefault(selectedName);
    onSelect(selected as Id<"hosts">);
  }

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
            {agent.agentName === defaultAgentName ? " \u2605" : ""}
          </option>
        ))}
      </ControlBarSelect>

      <ControlBarIconAction
        icon={<Play />}
        label="Start live"
        onClick={handleStart}
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
