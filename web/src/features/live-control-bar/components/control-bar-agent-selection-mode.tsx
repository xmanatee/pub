import type { Id } from "@backend/_generated/dataModel";
import { LayoutDashboard, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";

interface AgentInfo {
  presenceId: Id<"agentPresence">;
  agentName: string;
}

interface ControlBarAgentSelectionModeProps {
  agents: AgentInfo[];
  onExit: () => void;
  onSelect: (presenceId: Id<"agentPresence">) => void;
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
    <div className={cn(CB.controlBar, CB.controlHeight)}>
      {agents.map((agent) => (
        <Button
          key={agent.presenceId}
          variant="ghost"
          size="control"
          className="min-w-0 flex-1 truncate text-xs"
          onClick={() => onSelect(agent.presenceId)}
        >
          {agent.agentName}
        </Button>
      ))}

      <DashboardButton onExit={onExit} />
    </div>
  );
}

function MultiAgentLayout({ agents, onExit, onSelect }: ControlBarAgentSelectionModeProps) {
  const [selected, setSelected] = useState<Id<"agentPresence"> | "">("");

  return (
    <div className={cn(CB.controlBar, CB.controlHeight)}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as Id<"agentPresence">)}
        className="min-w-0 flex-1 truncate rounded-full bg-transparent px-3 text-xs outline-none"
      >
        <option value="" disabled>
          Select agent...
        </option>
        {agents.map((agent) => (
          <option key={agent.presenceId} value={agent.presenceId}>
            {agent.agentName}
          </option>
        ))}
      </select>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="control"
            className={CB.actionButton}
            onClick={() => onSelect(selected as Id<"agentPresence">)}
            disabled={!selected}
            aria-label="Start live"
          >
            <Play />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Start live</TooltipContent>
      </Tooltip>

      <DashboardButton onExit={onExit} />
    </div>
  );
}

function DashboardButton({ onExit }: { onExit: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="control"
          className={CB.actionButton}
          onClick={onExit}
          aria-label="Dashboard"
        >
          <LayoutDashboard />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Dashboard</TooltipContent>
    </Tooltip>
  );
}
