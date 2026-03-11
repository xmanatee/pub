import {
  readFiniteNumber,
  readNonEmptyString,
  readRecord,
  readString,
} from "./protocol-runtime-core";

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

const BRIDGE_MESSAGE_TYPES = new Set<BridgeMessageType>([
  "text",
  "html",
  "binary",
  "stream-start",
  "stream-data",
  "stream-end",
  "event",
]);

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
  | "ack"
  | "command.invoke"
  | "command.result"
  | "command.cancel";

export type BridgeCapability =
  | "text"
  | "html"
  | "audio"
  | "video"
  | "binary"
  | "stream"
  | "command";

export interface CapabilitiesPayload {
  caps: BridgeCapability[];
}

export interface ChannelEventPayload {
  channel: string;
  format?: string;
}

export interface StatusPayload {
  connected: boolean;
  channels?: string[];
  ready?: boolean;
  slug?: string;
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
  RENDER_ERROR: "render-error",
  AUDIO: "audio",
  MEDIA: "media",
  FILE: "file",
  COMMAND: "command",
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

function parseBridgeMessageMeta(input: unknown): BridgeMessageMeta | undefined | null {
  if (input === undefined) return undefined;
  const record = readRecord(input);
  if (!record) return null;

  const meta: BridgeMessageMeta = { ...record };
  const knownStringKeys = ["mime", "filename", "title"] as const;
  for (const key of knownStringKeys) {
    if (record[key] === undefined) continue;
    const value = readString(record[key]);
    if (value === undefined) return null;
    meta[key] = value;
  }

  const knownNumberKeys = ["sampleRate", "width", "height", "size"] as const;
  for (const key of knownNumberKeys) {
    if (record[key] === undefined) continue;
    const value = readFiniteNumber(record[key]);
    if (value === undefined) return null;
    meta[key] = value;
  }

  return meta;
}

export function parseBridgeMessage(input: unknown): BridgeMessage | null {
  const record = readRecord(input);
  if (!record) return null;

  const id = readNonEmptyString(record.id);
  const type = readString(record.type);
  if (!id || !type || !BRIDGE_MESSAGE_TYPES.has(type as BridgeMessageType)) {
    return null;
  }

  const data = record.data === undefined ? undefined : readString(record.data);
  if (record.data !== undefined && data === undefined) {
    return null;
  }

  const meta = parseBridgeMessageMeta(record.meta);
  if (meta === null) return null;

  return {
    id,
    type: type as BridgeMessageType,
    data,
    meta,
  };
}

export function decodeMessage(raw: string): BridgeMessage | null {
  try {
    return parseBridgeMessage(JSON.parse(raw));
  } catch (_error) {
    // Invalid JSON frames should be treated as non-protocol traffic.
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

export function makeStatusMessage(payload: StatusPayload): BridgeMessage {
  return makeEventMessage("status", { ...payload });
}

export function makeErrorMessage(payload: ErrorPayload): BridgeMessage {
  return makeEventMessage("error", { ...payload });
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

export function parseStatusMessage(msg: BridgeMessage): StatusPayload | null {
  if (msg.type !== "event" || msg.data !== "status" || !msg.meta) return null;

  const connected = msg.meta.connected === true;
  if (msg.meta.connected !== true && msg.meta.connected !== false) return null;

  const channels = Array.isArray(msg.meta.channels)
    ? msg.meta.channels.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const ready = msg.meta.ready === true ? true : msg.meta.ready === false ? false : undefined;
  const slug = typeof msg.meta.slug === "string" ? msg.meta.slug : undefined;

  return {
    connected,
    channels,
    ready,
    slug,
  };
}

export function parseErrorMessage(msg: BridgeMessage): ErrorPayload | null {
  if (msg.type !== "event" || msg.data !== "error" || !msg.meta) return null;

  const code = typeof msg.meta.code === "string" ? msg.meta.code : null;
  const message = typeof msg.meta.message === "string" ? msg.meta.message : null;
  const channel = typeof msg.meta.channel === "string" ? msg.meta.channel : undefined;
  if (!code || !message) return null;

  return {
    code,
    message,
    channel,
  };
}

export function shouldAcknowledgeMessage(channel: string, msg: BridgeMessage): boolean {
  return channel !== CONTROL_CHANNEL && parseAckMessage(msg) === null;
}
