import { Play } from "lucide-react";

interface ControlBarGoLiveModeProps {
  onGoLive: () => void;
}

export function ControlBarGoLiveMode({ onGoLive }: ControlBarGoLiveModeProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end px-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <button
        type="button"
        onClick={onGoLive}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl transition-opacity hover:opacity-90"
        aria-label="Go live"
      >
        <Play className="size-5 fill-current" />
      </button>
    </div>
  );
}
