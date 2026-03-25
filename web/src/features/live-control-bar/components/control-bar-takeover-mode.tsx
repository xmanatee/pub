import { LayoutDashboard, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ControlBarIconAction,
  ControlBarLabel,
  ControlBarPanel,
} from "~/components/control-bar/control-bar-parts";

const TAKEOVER_COOLDOWN_MS = 20_000;

interface ControlBarTakeoverModeProps {
  lastTakeoverAt: number | undefined;
  onExit: () => void;
  onTakeover: () => void;
  sessionState: "needs-takeover" | "taken-over";
}

export function ControlBarTakeoverMode({
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
    <ControlBarPanel>
      <ControlBarLabel>{statusText}</ControlBarLabel>
      <ControlBarIconAction
        icon={<LayoutDashboard />}
        label="Pubs"
        onClick={onExit}
        tooltip="Pubs"
      />
      <ControlBarIconAction
        icon={<RefreshCw />}
        label={actionTooltip}
        onClick={onTakeover}
        tooltip={actionTooltip}
        disabled={cooldownActive}
        variant="default"
      />
    </ControlBarPanel>
  );
}

function computeRemaining(lastTakeoverAt: number | undefined): number {
  if (!lastTakeoverAt) return 0;
  return Math.max(0, TAKEOVER_COOLDOWN_MS - (Date.now() - lastTakeoverAt));
}
