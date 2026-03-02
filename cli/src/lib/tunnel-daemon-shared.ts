import type { PubApiClient } from "./api.js";
import type { BridgeMessage } from "./bridge-protocol.js";

export type BridgeMode = "openclaw" | "none";

export interface ChannelBuffer {
  messages: Array<{ channel: string; msg: BridgeMessage; timestamp: number }>;
}

export interface StickyOutboundMessage {
  binaryPayload?: Buffer;
  msg: BridgeMessage;
}

export interface DaemonConfig {
  cliVersion?: string;
  apiClient: PubApiClient;
  socketPath: string;
  infoPath: string;
  bridgeMode?: BridgeMode;
}

export const OFFER_TIMEOUT_MS = 10_000;
export const SIGNAL_POLL_WAITING_MS = 5_000;
export const SIGNAL_POLL_CONNECTED_MS = 15_000;
export const LOCAL_CANDIDATE_FLUSH_MS = 2_000;
export const RECOVERY_DELAY_MS = 1_000;
export const WRITE_ACK_TIMEOUT_MS = 5_000;

const NOT_CONNECTED_WRITE_ERROR =
  "No browser connected. Ask the user to open the pub URL first, then retry.";

export function getTunnelWriteReadinessError(isConnected: boolean): string | null {
  return isConnected ? null : NOT_CONNECTED_WRITE_ERROR;
}

export function shouldRecoverForBrowserOfferChange(params: {
  incomingBrowserOffer: string | undefined;
  lastAppliedBrowserOffer: string | null;
}): boolean {
  const { incomingBrowserOffer, lastAppliedBrowserOffer } = params;
  if (!incomingBrowserOffer) return false;
  if (!lastAppliedBrowserOffer) return false;
  return incomingBrowserOffer !== lastAppliedBrowserOffer;
}

export const MAX_CANVAS_PERSIST_SIZE = 100 * 1024;

export function getStickyCanvasHtml(
  stickyOutbound: Map<string, StickyOutboundMessage>,
  canvasChannel: string,
): string | null {
  const sticky = stickyOutbound.get(canvasChannel);
  if (!sticky) return null;
  if (sticky.msg.type !== "html") return null;
  const html = sticky.msg.data;
  if (!html) return null;
  if (new TextEncoder().encode(html).byteLength > MAX_CANVAS_PERSIST_SIZE) return null;
  return html;
}

export function getSignalPollDelayMs(params: {
  hasActiveConnection: boolean;
  retryAfterSeconds?: number;
}): number {
  const baseDelay = params.hasActiveConnection ? SIGNAL_POLL_CONNECTED_MS : SIGNAL_POLL_WAITING_MS;
  if (params.retryAfterSeconds === undefined) return baseDelay;
  if (!Number.isFinite(params.retryAfterSeconds) || params.retryAfterSeconds <= 0) {
    return baseDelay;
  }
  return Math.max(baseDelay, Math.ceil(params.retryAfterSeconds * 1000));
}
