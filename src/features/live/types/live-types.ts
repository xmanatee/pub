export type LiveViewMode = "canvas" | "chat" | "settings";
export type {
  CanvasBridgeInboundMessage,
  CanvasBridgeInboundType,
  CanvasBridgeOutboundMessage,
  CanvasBridgeOutboundType,
} from "./live-command-types";

export interface LiveRenderErrorPayload {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

export type SessionState = "inactive" | "active" | "needs-takeover" | "taken-over";

export const LIVE_ANIMATION_STYLES = ["blob", "aurora", "orb"] as const;
export type LiveAnimationStyle = (typeof LIVE_ANIMATION_STYLES)[number];

export const LIVE_ANIMATION_STYLE_META: Record<
  LiveAnimationStyle,
  { description: string; label: string }
> = {
  aurora: {
    label: "Aurora",
    description: "Soft gradient clouds with gentle drift.",
  },
  orb: {
    label: "Orb",
    description: "Overlapping circles that pulse and breathe.",
  },
  blob: {
    label: "Blob",
    description: "A living organic shape that morphs and wobbles.",
  },
};

export type LiveVisualState =
  | "connecting"
  | "disconnected"
  | "waiting-content"
  | "idle"
  | "agent-thinking"
  | "agent-replying";

export function isLiveAnimationStyle(value: string): value is LiveAnimationStyle {
  return LIVE_ANIMATION_STYLES.includes(value as LiveAnimationStyle);
}
