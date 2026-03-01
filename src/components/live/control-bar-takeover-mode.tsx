import { LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { SessionState } from "./types";

const TAKEOVER_COOLDOWN_MS = 20_000;

interface ControlBarTakeoverModeProps {
  actionButtonClass: string;
  controlBarClass: string;
  controlHeightClass: string;
  lastTakeoverAt: number | undefined;
  onExit: () => void;
  onTakeover: () => void;
  sessionState: Exclude<SessionState, "active">;
}

export function ControlBarTakeoverMode({
  actionButtonClass,
  controlBarClass,
  controlHeightClass,
  lastTakeoverAt,
  onExit,
  onTakeover,
  sessionState,
}: ControlBarTakeoverModeProps) {
  const [remainingMs, setRemainingMs] = useState(() => computeRemaining(lastTakeoverAt));

  useEffect(() => {
    if (sessionState !== "taken-over") return;
    setRemainingMs(computeRemaining(lastTakeoverAt));
    const interval = setInterval(() => {
      setRemainingMs(computeRemaining(lastTakeoverAt));
    }, 1_000);
    return () => clearInterval(interval);
  }, [sessionState, lastTakeoverAt]);

  const cooldownActive = sessionState === "taken-over" && remainingMs > 0;
  const remainingSec = Math.ceil(remainingMs / 1_000);

  const statusText =
    sessionState === "needs-takeover"
      ? "Active on another device"
      : cooldownActive
        ? `Moved to another device · ${remainingSec}s`
        : "Moved to another device";

  const actionTooltip =
    sessionState === "needs-takeover"
      ? "Switch here"
      : cooldownActive
        ? `Reclaim (${remainingSec}s)`
        : "Reclaim";

  return (
    <div className={cn(controlBarClass, controlHeightClass)}>
      <span className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">
        {statusText}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="control"
            className={actionButtonClass}
            onClick={onExit}
            aria-label="Leave"
          >
            <LogOut />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Leave</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="control"
            className={actionButtonClass}
            onClick={onTakeover}
            disabled={cooldownActive}
            aria-label={actionTooltip}
          >
            <RefreshCw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{actionTooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function computeRemaining(lastTakeoverAt: number | undefined): number {
  if (!lastTakeoverAt) return 0;
  return Math.max(0, TAKEOVER_COOLDOWN_MS - (Date.now() - lastTakeoverAt));
}
