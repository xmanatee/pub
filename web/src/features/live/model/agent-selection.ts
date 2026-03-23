import type { Id } from "@backend/_generated/dataModel";

export interface AgentInfo {
  hostId: Id<"hosts">;
  agentName: string;
}

export function resolveSelectedHost(
  availableAgents: AgentInfo[],
  currentSelectedHostId: Id<"hosts"> | null,
  defaultAgentName: string | null,
): Id<"hosts"> | null {
  if (availableAgents.length === 0) return null;

  if (currentSelectedHostId !== null) {
    const stillAvailable = availableAgents.some((a) => a.hostId === currentSelectedHostId);
    if (stillAvailable) return currentSelectedHostId;
  }

  if (availableAgents.length === 1) return availableAgents[0].hostId;

  if (defaultAgentName !== null) {
    const match = availableAgents.find((a) => a.agentName === defaultAgentName);
    if (match) return match.hostId;
  }

  return null;
}
