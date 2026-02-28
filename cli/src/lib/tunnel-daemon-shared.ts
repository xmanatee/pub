import type { BridgeMessage } from "./bridge-protocol.js";
import type { TunnelApiClient } from "./tunnel-api.js";

export interface ChannelBuffer {
  messages: Array<{ channel: string; msg: BridgeMessage; timestamp: number }>;
}

export interface StickyOutboundMessage {
  binaryPayload?: Buffer;
  msg: BridgeMessage;
}

export interface DaemonConfig {
  tunnelId: string;
  apiClient: TunnelApiClient;
  socketPath: string;
  infoPath: string;
}

export const OFFER_TIMEOUT_MS = 10_000;
export const SIGNAL_POLL_WAITING_MS = 500;
export const SIGNAL_POLL_CONNECTED_MS = 2_000;
export const RECOVERY_DELAY_MS = 1_000;
export const WRITE_ACK_TIMEOUT_MS = 5_000;

const NOT_CONNECTED_WRITE_ERROR =
  "No browser connected. Ask the user to open the tunnel URL first, then retry.";

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
