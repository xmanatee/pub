/**
 * Bridge protocol — shared types for the pub.blue P2P tunnel.
 *
 * This file is source-of-truth for both app and CLI message/schema logic.
 */

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

export const CONTROL_CHANNEL = "_control";

export type ControlEvent =
  | "capabilities"
  | "channel.open"
  | "channel.close"
  | "session-context"
  | "status"
  | "error"
  | "ping"
  | "pong"
  | "ack";

export interface SessionContextPayload {
  title?: string;
  contentType?: string;
  contentPreview?: string;
  isPublic?: boolean;
  preferences?: {
    voiceModeEnabled?: boolean;
  };
}

export type BridgeCapability = "text" | "html" | "audio" | "video" | "binary" | "stream";

export interface CapabilitiesPayload {
  caps: BridgeCapability[];
}

export interface ChannelEventPayload {
  channel: string;
  format?: string;
}

export interface StatusPayload {
  connected: boolean;
  channels: string[];
}

export interface ErrorPayload {
  code: string;
  message: string;
  channel?: string;
}

export interface DeliveryAckPayload {
  messageId: string;
  channel: string;
  receivedAt?: number;
}

export const CHANNELS = {
  CHAT: "chat",
  CANVAS: "canvas",
  AUDIO: "audio",
  MEDIA: "media",
  FILE: "file",
} as const;

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

export function makeAckMessage(messageId: string, channel: string): BridgeMessage {
  return makeEventMessage("ack", { messageId, channel, receivedAt: Date.now() });
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

export function parseAckMessage(msg: BridgeMessage): DeliveryAckPayload | null {
  if (msg.type !== "event" || msg.data !== "ack" || !msg.meta) return null;

  const messageId = typeof msg.meta.messageId === "string" ? msg.meta.messageId : null;
  const channel = typeof msg.meta.channel === "string" ? msg.meta.channel : null;
  if (!messageId || !channel) return null;

  const receivedAt = typeof msg.meta.receivedAt === "number" ? msg.meta.receivedAt : undefined;
  return { messageId, channel, receivedAt };
}

export function shouldAcknowledgeMessage(channel: string, msg: BridgeMessage): boolean {
  return channel !== CONTROL_CHANNEL && parseAckMessage(msg) === null;
}
