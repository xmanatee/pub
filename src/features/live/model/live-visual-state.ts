import { useEffect, useMemo, useState } from "react";
import type { LiveVisualState } from "~/features/live/types/live-types";
import type { BridgeState } from "~/lib/webrtc-browser";

const RECENT_AGENT_ACTIVITY_WINDOW_MS = 4_000;
const RECENT_USER_DELIVERED_WINDOW_MS = 12_000;

interface ResolveVisualStateParams {
  bridgeState: BridgeState;
  hasCanvasContent: boolean;
  lastAgentActivityAt: number | null;
  lastUserDeliveredAt: number | null;
  now: number;
}

export function resolveLiveVisualState({
  bridgeState,
  hasCanvasContent,
  lastAgentActivityAt,
  lastUserDeliveredAt,
  now,
}: ResolveVisualStateParams): LiveVisualState {
  if (bridgeState === "connecting") return "connecting";
  if (bridgeState === "disconnected" || bridgeState === "closed") return "disconnected";

  const hasRecentAgentActivity =
    typeof lastAgentActivityAt === "number" &&
    now - lastAgentActivityAt <= RECENT_AGENT_ACTIVITY_WINDOW_MS;
  if (hasRecentAgentActivity) return "agent-replying";

  const isWaitingForAgentReply =
    typeof lastUserDeliveredAt === "number" &&
    now - lastUserDeliveredAt <= RECENT_USER_DELIVERED_WINDOW_MS &&
    (typeof lastAgentActivityAt !== "number" || lastAgentActivityAt < lastUserDeliveredAt);
  if (isWaitingForAgentReply) return "agent-thinking";

  if (!hasCanvasContent) return "waiting-content";

  return "idle";
}

interface UseLiveVisualStateParams {
  bridgeState: BridgeState;
  hasCanvasContent: boolean;
  lastAgentActivityAt: number | null;
  lastUserDeliveredAt: number | null;
}

export function useLiveVisualState({
  bridgeState,
  hasCanvasContent,
  lastAgentActivityAt,
  lastUserDeliveredAt,
}: UseLiveVisualStateParams): LiveVisualState {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  return useMemo(
    () =>
      resolveLiveVisualState({
        bridgeState,
        hasCanvasContent,
        lastAgentActivityAt,
        lastUserDeliveredAt,
        now,
      }),
    [bridgeState, hasCanvasContent, lastAgentActivityAt, lastUserDeliveredAt, now],
  );
}
