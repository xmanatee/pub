import { Loader2, Play } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";

interface ControlBarGoLiveModeProps {
  agentOnline: boolean | undefined;
  availableAgents: Array<{
    presenceId: Id<"agentPresence">;
    agentName: string;
  }>;
  selectedPresenceId: Id<"agentPresence"> | null;
  onSelectedPresenceChange: (presenceId: Id<"agentPresence">) => void;
  onGoLive: () => void;
}

export function ControlBarGoLiveMode({
  agentOnline,
  availableAgents,
  selectedPresenceId,
  onSelectedPresenceChange,
  onGoLive,
}: ControlBarGoLiveModeProps) {
  const disabled = agentOnline !== true;
  const selectedLabel =
    availableAgents.find((agent) => agent.presenceId === selectedPresenceId)?.agentName ??
    availableAgents[0]?.agentName ??
    "Agent";
  const selectedValue = selectedPresenceId ?? availableAgents[0]?.presenceId ?? "";
  const ariaLabel =
    agentOnline === undefined
      ? "Checking agent availability"
      : disabled
        ? "Agent offline"
        : `Go live with ${selectedLabel}`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex items-center justify-end px-3 gap-2"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      {availableAgents.length > 1 ? (
        <div className="pointer-events-auto rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl px-3 h-12 flex items-center">
          <label htmlFor="go-live-agent-select" className="sr-only">
            Select agent
          </label>
          <select
            id="go-live-agent-select"
            value={selectedValue}
            onChange={(event) =>
              onSelectedPresenceChange(event.target.value as Id<"agentPresence">)
            }
            className="bg-transparent text-sm max-w-44 truncate focus:outline-none"
          >
            {availableAgents.map((agent) => (
              <option key={agent.presenceId} value={agent.presenceId}>
                {agent.agentName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onGoLive}
        disabled={disabled}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-label={ariaLabel}
        title={disabled ? "Agent is offline" : `Go live with ${selectedLabel}`}
      >
        {agentOnline === undefined ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Play className="size-5 fill-current" />
        )}
      </button>
    </div>
  );
}
