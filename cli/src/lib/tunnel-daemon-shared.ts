import type { PubApiClient } from "./api.js";
import type { BridgeMessage } from "./bridge-protocol.js";

export interface ChannelBuffer {
  messages: Array<{ channel: string; msg: BridgeMessage; timestamp: number }>;
}

export interface StickyOutboundMessage {
  binaryPayload?: Buffer;
  msg: BridgeMessage;
}

export interface BridgeDaemonConfig {
  bridgeMode: "openclaw";
  bridgeScript: string;
  bridgeInfoPath: string;
  bridgeLogPath: string;
  bridgeProcessEnv: NodeJS.ProcessEnv;
}

export interface DaemonConfig {
  cliVersion?: string;
  slug: string;
  apiClient: PubApiClient;
  socketPath: string;
  infoPath: string;
  bridge?: BridgeDaemonConfig;
}

export const BRIDGE_CHECK_INTERVAL_MS = 30_000;
export const BRIDGE_MAX_RAPID_RESTARTS = 3;
export const BRIDGE_RAPID_RESTART_WINDOW_MS = 5 * 60 * 1000;

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

export function shouldRecoverForBrowserAnswerChange(params: {
  incomingBrowserAnswer: string | undefined;
  lastAppliedBrowserAnswer: string | null;
  remoteDescriptionApplied: boolean;
}): boolean {
  const { incomingBrowserAnswer, lastAppliedBrowserAnswer, remoteDescriptionApplied } = params;
  if (!remoteDescriptionApplied) return false;
  if (!incomingBrowserAnswer) return false;
  return incomingBrowserAnswer !== lastAppliedBrowserAnswer;
}

export function getSignalPollDelayMs(params: {
  remoteDescriptionApplied: boolean;
  retryAfterSeconds?: number;
}): number {
  const baseDelay = params.remoteDescriptionApplied
    ? SIGNAL_POLL_CONNECTED_MS
    : SIGNAL_POLL_WAITING_MS;
  if (params.retryAfterSeconds === undefined) return baseDelay;
  if (!Number.isFinite(params.retryAfterSeconds) || params.retryAfterSeconds <= 0) {
    return baseDelay;
  }
  return Math.max(baseDelay, Math.ceil(params.retryAfterSeconds * 1000));
}
