export type TunnelViewMode = "canvas" | "chat" | "settings";

export const TUNNEL_ANIMATION_STYLES = ["blob", "aurora", "orb"] as const;
export type TunnelAnimationStyle = (typeof TUNNEL_ANIMATION_STYLES)[number];

export const TUNNEL_ANIMATION_STYLE_META: Record<
  TunnelAnimationStyle,
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

export type TunnelSessionVisualState =
  | "connecting"
  | "disconnected"
  | "waiting-content"
  | "idle"
  | "agent-thinking"
  | "agent-replying";

export function isTunnelAnimationStyle(value: string): value is TunnelAnimationStyle {
  return TUNNEL_ANIMATION_STYLES.includes(value as TunnelAnimationStyle);
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
