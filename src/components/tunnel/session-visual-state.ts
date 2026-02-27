import { useEffect, useMemo, useState } from "react";
import type { BridgeState } from "~/lib/webrtc-browser";
import type { TunnelSessionVisualState } from "./types";

const RECENT_AGENT_ACTIVITY_WINDOW_MS = 4_000;
const RECENT_USER_DELIVERED_WINDOW_MS = 12_000;

interface ResolveVisualStateParams {
  bridgeState: BridgeState;
  hasCanvasContent: boolean;
  lastAgentActivityAt: number | null;
  lastUserDeliveredAt: number | null;
  now: number;
}

export function resolveTunnelSessionVisualState({
  bridgeState,
  hasCanvasContent,
  lastAgentActivityAt,
  lastUserDeliveredAt,
  now,
}: ResolveVisualStateParams): TunnelSessionVisualState {
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
  if (isWaitingForAgentReply) return "agent-replying";

  if (!hasCanvasContent) return "waiting-content";

  return "idle";
}

interface UseTunnelSessionVisualStateParams {
  bridgeState: BridgeState;
  hasCanvasContent: boolean;
  lastAgentActivityAt: number | null;
  lastUserDeliveredAt: number | null;
}

export function useTunnelSessionVisualState({
  bridgeState,
  hasCanvasContent,
  lastAgentActivityAt,
  lastUserDeliveredAt,
}: UseTunnelSessionVisualStateParams): TunnelSessionVisualState {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  return useMemo(
    () =>
      resolveTunnelSessionVisualState({
        bridgeState,
        hasCanvasContent,
        lastAgentActivityAt,
        lastUserDeliveredAt,
        now,
      }),
    [bridgeState, hasCanvasContent, lastAgentActivityAt, lastUserDeliveredAt, now],
  );
}
