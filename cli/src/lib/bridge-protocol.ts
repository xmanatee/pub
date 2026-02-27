/**
 * Bridge protocol — shared types for the pub.blue P2P tunnel.
 *
 * Both the browser client and CLI daemon speak this protocol over
 * WebRTC DataChannels. Each named DataChannel is a logical "channel"
 * that carries typed messages.
 *
 * NOTE: This is a copy of src/lib/bridge-protocol.ts for the CLI package.
 * Keep them in sync.
 */

// -- Message types -----------------------------------------------------------

export type BridgeMessageType =
  | "text"
  | "html"
  | "binary"
  | "stream-start"
  | "stream-data"
  | "stream-end"
  | "event";

export interface BridgeMessageMeta {
  mime?: string;
  filename?: string;
  title?: string;
  sampleRate?: number;
  width?: number;
  height?: number;
  size?: number;
  [key: string]: unknown;
}

export interface BridgeMessage {
  id: string;
  type: BridgeMessageType;
  data?: string;
  meta?: BridgeMessageMeta;
}

// -- Control channel events --------------------------------------------------

export const CONTROL_CHANNEL = "_control";

export type ControlEvent =
  | "capabilities"
  | "channel.open"
  | "channel.close"
  | "status"
  | "error"
  | "ping"
  | "pong";

export type BridgeCapability = "text" | "html" | "audio" | "video" | "binary" | "stream";

// -- Default channel names (convention) --------------------------------------

export const CHANNELS = {
  CHAT: "chat",
  CANVAS: "canvas",
  AUDIO: "audio",
  MEDIA: "media",
  FILE: "file",
} as const;

// -- Helpers -----------------------------------------------------------------

let idCounter = 0;

export function generateMessageId(): string {
  const ts = Date.now().toString(36);
  const seq = (idCounter++).toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${seq}-${rand}`;
}

export function encodeMessage(msg: BridgeMessage): string {
  return JSON.stringify(msg);
}

export function decodeMessage(raw: string): BridgeMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && typeof parsed.type === "string") {
      return parsed as BridgeMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function makeTextMessage(content: string): BridgeMessage {
  return { id: generateMessageId(), type: "text", data: content };
}

export function makeHtmlMessage(html: string, title?: string): BridgeMessage {
  return {
    id: generateMessageId(),
    type: "html",
    data: html,
    meta: title ? { title } : undefined,
  };
}

export function makeEventMessage(event: ControlEvent, meta?: BridgeMessageMeta): BridgeMessage {
  return { id: generateMessageId(), type: "event", data: event, meta };
}

export function makeBinaryMetaMessage(meta: BridgeMessageMeta): BridgeMessage {
  return { id: generateMessageId(), type: "binary", meta };
}

export function makeStreamStart(meta?: BridgeMessageMeta): BridgeMessage {
  return { id: generateMessageId(), type: "stream-start", meta };
}

export function makeStreamEnd(streamId: string): BridgeMessage {
  return { id: generateMessageId(), type: "stream-end", meta: { streamId } };
}

// -- Tunnel ID generation ----------------------------------------------------

export function generateTunnelId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// -- Constants ---------------------------------------------------------------

export const MAX_TUNNEL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_TUNNEL_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_TUNNELS_PER_USER = 5;
