import type { BridgeMessage } from "../../../shared/bridge-protocol-core";
import type { BridgeStatus } from "./live-bridge-shared.js";

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

export interface RawIpcRequest {
  method: string;
  params: Record<string, unknown>;
}
