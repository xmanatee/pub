import { Loader2, Play } from "lucide-react";

interface ControlBarGoLiveModeProps {
  agentOnline: boolean | undefined;
  onGoLive: () => void;
}

export function ControlBarGoLiveMode({ agentOnline, onGoLive }: ControlBarGoLiveModeProps) {
  const disabled = agentOnline !== true;
  const ariaLabel =
    agentOnline === undefined
      ? "Checking agent availability"
      : disabled
        ? "Agent offline"
        : "Go live";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex justify-end px-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <button
        type="button"
        onClick={onGoLive}
        disabled={disabled}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-label={ariaLabel}
        title={disabled ? "Agent is offline" : "Go live"}
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
