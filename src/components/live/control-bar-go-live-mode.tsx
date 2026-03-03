import { useQuery } from "convex/react";
import { Loader2, Play } from "lucide-react";
import { api } from "../../../convex/_generated/api";

interface ControlBarGoLiveModeProps {
  slug: string;
  onGoLive: () => void;
}

export function ControlBarGoLiveMode({ slug, onGoLive }: ControlBarGoLiveModeProps) {
  const agentOnline = useQuery(api.presence.isAgentOnline, { slug });

  if (agentOnline === false) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex justify-end px-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <button
        type="button"
        onClick={onGoLive}
        disabled={agentOnline === undefined}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-label="Go live"
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
