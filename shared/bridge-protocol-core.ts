/**
 * Bridge protocol — shared types for the pub.blue P2P bridge.
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
  | "status"
  | "error"
  | "delivery"
  | "ping"
  | "pong"
  | "ack";

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

export type DeliveryStage = "received" | "confirmed" | "failed";

export interface DeliveryReceiptPayload {
  messageId: string;
  channel: string;
  stage: DeliveryStage;
  at?: number;
  error?: string;
}

export const CHANNELS = {
  CHAT: "chat",
  CANVAS: "canvas",
  RENDER_ERROR: "render-error",
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

export function makeDeliveryReceiptMessage(payload: {
  messageId: string;
  channel: string;
  stage: DeliveryStage;
  error?: string;
}): BridgeMessage {
  return makeEventMessage("delivery", {
    messageId: payload.messageId,
    channel: payload.channel,
    stage: payload.stage,
    at: Date.now(),
    error: payload.error,
  });
}

export function makeBinaryMetaMessage(meta: BridgeMessageMeta, id?: string): BridgeMessage {
  return { id: id ?? generateMessageId(), type: "binary", meta };
}

export function makeStreamStart(meta?: BridgeMessageMeta, id?: string): BridgeMessage {
  return { id: id ?? generateMessageId(), type: "stream-start", meta };
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

export function parseDeliveryReceiptMessage(msg: BridgeMessage): DeliveryReceiptPayload | null {
  if (msg.type !== "event" || msg.data !== "delivery" || !msg.meta) return null;

  const messageId = typeof msg.meta.messageId === "string" ? msg.meta.messageId : null;
  const channel = typeof msg.meta.channel === "string" ? msg.meta.channel : null;
  const stage = typeof msg.meta.stage === "string" ? msg.meta.stage : null;
  if (!messageId || !channel || !stage) return null;
  if (stage !== "received" && stage !== "confirmed" && stage !== "failed") return null;

  const at = typeof msg.meta.at === "number" ? msg.meta.at : undefined;
  const error = typeof msg.meta.error === "string" ? msg.meta.error : undefined;
  return { messageId, channel, stage, at, error };
}

export function shouldAcknowledgeMessage(channel: string, msg: BridgeMessage): boolean {
  return channel !== CONTROL_CHANNEL && parseAckMessage(msg) === null;
}
