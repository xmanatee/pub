import { type BridgeMessage, parseBridgeMessage } from "../../../../shared/bridge-protocol-core";
import {
  readBoolean,
  readFiniteNumber,
  readRecord,
  readString,
} from "../../../../shared/protocol-runtime-core";
import type { BridgeStatus } from "../bridge/shared.js";
import type { BridgeSessionSource } from "../bridge/types.js";

export interface BufferedBridgeMessage {
  channel: string;
  msg: BridgeMessage;
  timestamp?: number;
}

export interface StatusResponse {
  ok: boolean;
  connected: boolean;
  signalingConnected: boolean | null;
  activeSlug: string | null;
  uptime: number;
  channels: string[];
  bufferedMessages: number;
  lastError: string | null;
  bridgeMode: string | null;
  bridge: BridgeStatus | null;
  logPath: string | null;
  error?: string;
}

export interface WriteRequest {
  method: "write";
  params: {
    channel?: string;
    msg: BridgeMessage;
    binaryBase64?: string;
  };
}

export interface WriteResponse {
  ok: boolean;
  delivered?: boolean;
  error?: string;
}

export interface ReadRequest {
  method: "read";
  params: {
    channel?: string;
  };
}

export interface ReadResponse {
  ok: boolean;
  messages?: BufferedBridgeMessage[];
  error?: string;
}

export interface ChannelsRequest {
  method: "channels";
  params: Record<string, never>;
}

export interface ChannelsResponse {
  ok: boolean;
  channels?: Array<{ name: string; direction: string }>;
  error?: string;
}

export interface StatusRequest {
  method: "status";
  params: Record<string, never>;
}

export interface ActiveSlugRequest {
  method: "active-slug";
  params: Record<string, never>;
}

export interface ActiveSlugResponse {
  ok: boolean;
  slug?: string | null;
  error?: string;
}

export interface CloseRequest {
  method: "close";
  params: Record<string, never>;
}

export interface CloseResponse {
  ok: boolean;
  error?: string;
}

export type IpcRequest =
  | WriteRequest
  | ReadRequest
  | ChannelsRequest
  | StatusRequest
  | ActiveSlugRequest
  | CloseRequest;

export interface IpcResponseMap {
  "active-slug": ActiveSlugResponse;
  channels: ChannelsResponse;
  close: CloseResponse;
  read: ReadResponse;
  status: StatusResponse;
  write: WriteResponse;
}

export type IpcResponseFor<T extends keyof IpcResponseMap> = IpcResponseMap[T];

function parseBufferedBridgeMessage(input: unknown): BufferedBridgeMessage | null {
  const record = readRecord(input);
  if (!record) return null;
  const channel = readString(record.channel);
  const msg = parseBridgeMessage(record.msg);
  if (!channel || !msg) return null;

  return {
    channel,
    msg,
    timestamp: readFiniteNumber(record.timestamp),
  };
}

function parseBridgeStatus(input: unknown): BridgeStatus | null {
  if (input === null) return null;
  const record = readRecord(input);
  if (!record) return null;
  const running = readBoolean(record.running);
  const forwardedMessages = readFiniteNumber(record.forwardedMessages);
  if (running === undefined || forwardedMessages === undefined) return null;
  const sessionSourceRaw =
    record.sessionSource === undefined ? undefined : readString(record.sessionSource);
  const sessionSource =
    sessionSourceRaw === undefined ||
    sessionSourceRaw === "env" ||
    sessionSourceRaw === "thread-canonical" ||
    sessionSourceRaw === "thread-legacy" ||
    sessionSourceRaw === "main-fallback"
      ? (sessionSourceRaw as BridgeSessionSource | undefined)
      : null;
  if (sessionSource === null) return null;

  return {
    running,
    sessionId: readString(record.sessionId),
    sessionKey: readString(record.sessionKey),
    sessionSource,
    lastError: readString(record.lastError),
    forwardedMessages,
  };
}

export function parseIpcRequest(input: unknown): IpcRequest | null {
  const record = readRecord(input);
  if (!record) return null;

  const method = readString(record.method);
  const params = readRecord(record.params);
  if (!method || !params) return null;

  if (method === "write") {
    const msg = parseBridgeMessage(params.msg);
    if (!msg) return null;
    const channel = params.channel === undefined ? undefined : readString(params.channel);
    const binaryBase64 =
      params.binaryBase64 === undefined ? undefined : readString(params.binaryBase64);
    if (params.channel !== undefined && channel === undefined) return null;
    if (params.binaryBase64 !== undefined && binaryBase64 === undefined) return null;
    return {
      method,
      params: {
        channel,
        msg,
        binaryBase64,
      },
    };
  }

  if (method === "read") {
    const channel = params.channel === undefined ? undefined : readString(params.channel);
    if (params.channel !== undefined && channel === undefined) return null;
    return { method, params: { channel } };
  }

  if (
    method === "channels" ||
    method === "status" ||
    method === "active-slug" ||
    method === "close"
  ) {
    return { method, params: {} };
  }

  return null;
}

export function parseIpcResponse<T extends IpcRequest["method"]>(
  method: T,
  input: unknown,
): IpcResponseFor<T> | null {
  const record = readRecord(input);
  if (!record) return null;
  const ok = readBoolean(record.ok);
  if (ok === undefined) return null;
  const error = record.error === undefined ? undefined : readString(record.error);
  if (record.error !== undefined && error === undefined) return null;
  if (!ok) return { ok, error } as IpcResponseFor<T>;

  if (method === "write") {
    const delivered = record.delivered === undefined ? undefined : readBoolean(record.delivered);
    if (record.delivered !== undefined && delivered === undefined) return null;
    return { ok, delivered, error } as IpcResponseFor<T>;
  }

  if (method === "read") {
    if (record.messages === undefined) return { ok, error } as IpcResponseFor<T>;
    if (!Array.isArray(record.messages)) return null;
    const messages = record.messages
      .map((entry) => parseBufferedBridgeMessage(entry))
      .filter((entry): entry is BufferedBridgeMessage => entry !== null);
    if (messages.length !== record.messages.length) return null;
    return { ok, messages, error } as IpcResponseFor<T>;
  }

  if (method === "channels") {
    if (record.channels === undefined) return { ok, error } as IpcResponseFor<T>;
    if (!Array.isArray(record.channels)) return null;
    const channels = record.channels
      .map((entry) => {
        const channelRecord = readRecord(entry);
        if (!channelRecord) return null;
        const name = readString(channelRecord.name);
        const direction = readString(channelRecord.direction);
        if (!name || !direction) return null;
        return { name, direction };
      })
      .filter((entry): entry is { name: string; direction: string } => entry !== null);
    if (channels.length !== record.channels.length) return null;
    return { ok, channels, error } as IpcResponseFor<T>;
  }

  if (method === "status") {
    const connected = readBoolean(record.connected);
    const signalingConnected =
      record.signalingConnected === null
        ? null
        : record.signalingConnected === undefined
          ? undefined
          : readBoolean(record.signalingConnected);
    const activeSlug =
      record.activeSlug === null
        ? null
        : record.activeSlug === undefined
          ? undefined
          : readString(record.activeSlug);
    const uptime = readFiniteNumber(record.uptime);
    const bufferedMessages = readFiniteNumber(record.bufferedMessages);
    const lastError =
      record.lastError === null
        ? null
        : record.lastError === undefined
          ? undefined
          : readString(record.lastError);
    const bridgeMode =
      record.bridgeMode === null
        ? null
        : record.bridgeMode === undefined
          ? undefined
          : readString(record.bridgeMode);
    if (
      connected === undefined ||
      signalingConnected === undefined ||
      activeSlug === undefined ||
      uptime === undefined ||
      !Array.isArray(record.channels) ||
      bufferedMessages === undefined ||
      lastError === undefined ||
      bridgeMode === undefined
    ) {
      return null;
    }
    const channels = record.channels.filter((entry): entry is string => typeof entry === "string");
    if (channels.length !== record.channels.length) return null;
    const bridge = record.bridge === undefined ? null : parseBridgeStatus(record.bridge);
    if (record.bridge !== undefined && bridge === null && record.bridge !== null) return null;
    const logPath =
      record.logPath === null || record.logPath === undefined
        ? null
        : readString(record.logPath) ?? null;
    return {
      ok,
      connected,
      signalingConnected,
      activeSlug,
      uptime,
      channels,
      bufferedMessages,
      lastError,
      bridgeMode,
      bridge,
      logPath,
      error,
    } as IpcResponseFor<T>;
  }

  if (method === "active-slug") {
    const slug =
      record.slug === null ? null : record.slug === undefined ? undefined : readString(record.slug);
    if (record.slug !== undefined && slug === undefined) return null;
    return { ok, slug, error } as IpcResponseFor<T>;
  }

  return { ok, error } as IpcResponseFor<T>;
}
