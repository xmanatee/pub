import type { BridgeMessage } from "./bridge-protocol-core";
import { parseBridgeMessage } from "./bridge-protocol-core";
import { readRecord, readString } from "./protocol-runtime-core";

export const DEFAULT_RELAY_URL = "https://pub-relay.mishaplots.workers.dev";

export type HttpRequestMessage = {
  type: "http-request";
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
};

export type WsOpenMessage = {
  type: "ws-open";
  id: string;
  path: string;
  headers: Record<string, string>;
};

export type WsDataMessage = {
  type: "ws-data";
  id: string;
  data: string;
  binary: boolean;
};

export type WsCloseMessage = {
  type: "ws-close";
  id: string;
  code?: number;
  reason?: string;
};

export type ChannelMessage = {
  type: "channel";
  channel: string;
  message: BridgeMessage;
};

export type ChannelBinaryMessage = {
  type: "channel-binary";
  channel: string;
  data: string;
};

export type PingMessage = { type: "ping" };

export type RelayToDaemonMessage =
  | HttpRequestMessage
  | WsOpenMessage
  | WsDataMessage
  | WsCloseMessage
  | ChannelMessage
  | ChannelBinaryMessage
  | PingMessage;

export type HttpResponseMessage = {
  type: "http-response";
  id: string;
  status: number;
  headers: Record<string, string>;
  body?: string;
};

export type HttpResponseStartMessage = {
  type: "http-response-start";
  id: string;
  status: number;
  headers: Record<string, string>;
};

export type HttpResponseChunkMessage = {
  type: "http-response-chunk";
  id: string;
  data: string;
  done: boolean;
};

export type PongMessage = { type: "pong" };

export type DaemonToRelayMessage =
  | HttpResponseMessage
  | HttpResponseStartMessage
  | HttpResponseChunkMessage
  | WsDataMessage
  | WsCloseMessage
  | ChannelMessage
  | ChannelBinaryMessage
  | PongMessage;

export function encodeTunnelMessage(msg: RelayToDaemonMessage | DaemonToRelayMessage): string {
  return JSON.stringify(msg);
}

export function decodeTunnelMessage(raw: string): Record<string, unknown> | null {
  try {
    return readRecord(JSON.parse(raw)) ?? null;
  } catch {
    return null;
  }
}

export function parseRelayToDaemonMessage(raw: string): RelayToDaemonMessage | null {
  const obj = decodeTunnelMessage(raw);
  if (!obj) return null;

  const type = readString(obj.type);
  switch (type) {
    case "http-request":
      return parseHttpRequestMessage(obj);
    case "ws-open":
      return parseWsOpenMessage(obj);
    case "ws-data":
      return parseWsDataMessage(obj);
    case "ws-close":
      return parseWsCloseMessage(obj);
    case "channel":
      return parseChannelMessage(obj);
    case "channel-binary":
      return parseChannelBinaryMessage(obj);
    case "ping":
      return { type: "ping" };
    default:
      return null;
  }
}

export function parseDaemonToRelayMessage(raw: string): DaemonToRelayMessage | null {
  const obj = decodeTunnelMessage(raw);
  if (!obj) return null;

  const type = readString(obj.type);
  switch (type) {
    case "http-response":
      return parseHttpResponseMessage(obj);
    case "http-response-start":
      return parseHttpResponseStartMessage(obj);
    case "http-response-chunk":
      return parseHttpResponseChunkMessage(obj);
    case "ws-data":
      return parseWsDataMessage(obj);
    case "ws-close":
      return parseWsCloseMessage(obj);
    case "channel":
      return parseChannelMessage(obj);
    case "channel-binary":
      return parseChannelBinaryMessage(obj);
    case "pong":
      return { type: "pong" };
    default:
      return null;
  }
}

function readStringRecord(input: unknown): Record<string, string> | null {
  const rec = readRecord(input);
  if (!rec) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v !== "string") return null;
    out[k] = v;
  }
  return out;
}

function parseHttpRequestMessage(obj: Record<string, unknown>): HttpRequestMessage | null {
  const id = readString(obj.id);
  const method = readString(obj.method);
  const path = readString(obj.path);
  const headers = readStringRecord(obj.headers);
  if (!id || !method || !path || !headers) return null;
  const body = obj.body === undefined ? undefined : readString(obj.body);
  if (obj.body !== undefined && body === undefined) return null;
  return { type: "http-request", id, method, path, headers, body };
}

function parseWsOpenMessage(obj: Record<string, unknown>): WsOpenMessage | null {
  const id = readString(obj.id);
  const path = readString(obj.path);
  const headers = readStringRecord(obj.headers);
  if (!id || !path || !headers) return null;
  return { type: "ws-open", id, path, headers };
}

function parseWsDataMessage(obj: Record<string, unknown>): WsDataMessage | null {
  const id = readString(obj.id);
  const data = readString(obj.data);
  if (!id || !data) return null;
  return { type: "ws-data", id, data, binary: obj.binary === true };
}

function parseWsCloseMessage(obj: Record<string, unknown>): WsCloseMessage | null {
  const id = readString(obj.id);
  if (!id) return null;
  return {
    type: "ws-close",
    id,
    code: typeof obj.code === "number" ? obj.code : undefined,
    reason: typeof obj.reason === "string" ? obj.reason : undefined,
  };
}

function parseHttpResponseMessage(obj: Record<string, unknown>): HttpResponseMessage | null {
  const id = readString(obj.id);
  const status = typeof obj.status === "number" ? obj.status : null;
  const headers = readStringRecord(obj.headers);
  if (!id || status === null || !headers) return null;
  const body = obj.body === undefined ? undefined : readString(obj.body);
  if (obj.body !== undefined && body === undefined) return null;
  return { type: "http-response", id, status, headers, body };
}

function parseHttpResponseStartMessage(
  obj: Record<string, unknown>,
): HttpResponseStartMessage | null {
  const id = readString(obj.id);
  const status = typeof obj.status === "number" ? obj.status : null;
  const headers = readStringRecord(obj.headers);
  if (!id || status === null || !headers) return null;
  return { type: "http-response-start", id, status, headers };
}

function parseHttpResponseChunkMessage(
  obj: Record<string, unknown>,
): HttpResponseChunkMessage | null {
  const id = readString(obj.id);
  const data = readString(obj.data);
  if (!id || data === undefined) return null;
  return { type: "http-response-chunk", id, data, done: obj.done === true };
}

function parseChannelMessage(obj: Record<string, unknown>): ChannelMessage | null {
  const channel = readString(obj.channel);
  const messageObj = readRecord(obj.message);
  if (!channel || !messageObj) return null;
  const message = parseBridgeMessage(messageObj);
  if (!message) return null;
  return { type: "channel", channel, message };
}

function parseChannelBinaryMessage(obj: Record<string, unknown>): ChannelBinaryMessage | null {
  const channel = readString(obj.channel);
  const data = readString(obj.data);
  if (!channel || !data) return null;
  return { type: "channel-binary", channel, data };
}
