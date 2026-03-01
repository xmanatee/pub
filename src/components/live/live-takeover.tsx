import { useEffect, useState } from "react";

const TAKEOVER_COOLDOWN_MS = 20_000;
const WRAPPER_CLASS = "fixed inset-0 z-50 flex items-center justify-center bg-background";

interface TakeoverPromptProps {
  className?: string;
  onTakeover: () => void;
  onDismiss: () => void;
}

export function TakeoverPrompt({ className, onTakeover, onDismiss }: TakeoverPromptProps) {
  return (
    <div className={className ?? WRAPPER_CLASS}>
      <div className="flex flex-col items-center gap-6 max-w-sm px-6 text-center">
        <p className="text-foreground text-sm">Live is active on another device.</p>
        <p className="text-muted-foreground text-sm">Switch to this device?</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onTakeover}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Yes, switch here
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 rounded-md bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}

interface TakenOverBannerProps {
  className?: string;
  lastTakeoverAt: number | undefined;
  onReclaim: () => void;
}

export function TakenOverBanner({ className, lastTakeoverAt, onReclaim }: TakenOverBannerProps) {
  const [remainingMs, setRemainingMs] = useState(() => computeRemaining(lastTakeoverAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(computeRemaining(lastTakeoverAt));
    }, 1_000);
    return () => clearInterval(interval);
  }, [lastTakeoverAt]);

  const cooldownActive = remainingMs > 0;
  const remainingSec = Math.ceil(remainingMs / 1_000);

  return (
    <div className={className ?? WRAPPER_CLASS}>
      <div className="flex flex-col items-center gap-6 max-w-sm px-6 text-center">
        <p className="text-foreground text-sm">Live session was moved to another device.</p>
        <button
          type="button"
          onClick={onReclaim}
          disabled={cooldownActive}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cooldownActive ? `Reclaim (${remainingSec}s)` : "Reclaim"}
        </button>
      </div>
    </div>
  );
}

function computeRemaining(lastTakeoverAt: number | undefined): number {
  if (!lastTakeoverAt) return 0;
  return Math.max(0, TAKEOVER_COOLDOWN_MS - (Date.now() - lastTakeoverAt));
}
