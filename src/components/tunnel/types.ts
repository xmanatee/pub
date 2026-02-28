export type TunnelViewMode = "canvas" | "chat" | "settings";

export const TUNNEL_ANIMATION_STYLES = ["aurora", "rings", "mesh"] as const;
export type TunnelAnimationStyle = (typeof TUNNEL_ANIMATION_STYLES)[number];

export const TUNNEL_ANIMATION_STYLE_META: Record<
  TunnelAnimationStyle,
  { description: string; label: string }
> = {
  aurora: {
    label: "Aurora",
    description: "Soft gradient clouds with gentle drift.",
  },
  rings: {
    label: "Rings",
    description: "Layered halos that pulse around session activity.",
  },
  mesh: {
    label: "Mesh",
    description: "Depth-focused blobs with continuous movement.",
  },
};

export type TunnelSessionVisualState =
  | "connecting"
  | "disconnected"
  | "waiting-content"
  | "idle"
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
