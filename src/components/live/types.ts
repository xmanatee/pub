export type LiveViewMode = "canvas" | "chat" | "settings";

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
  | "agent-replying";

export function isLiveAnimationStyle(value: string): value is LiveAnimationStyle {
  return LIVE_ANIMATION_STYLES.includes(value as LiveAnimationStyle);
}

export interface ChatEntry {
  id: string;
  from: "user" | "agent";
  content: string;
  timestamp: number;
  delivery?: "sending" | "confirming" | "delivered" | "failed";
}

export interface ReceivedFile {
  id: string;
  filename: string;
  mime: string;
  size: number;
  downloadUrl: string;
  timestamp: number;
}
