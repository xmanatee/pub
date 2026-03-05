import type { PubApiClient } from "./api.js";
import type { BridgeMessage } from "../../../shared/bridge-protocol-core";

export type BridgeMode = "openclaw" | "claude-code";

export interface BridgeInstructions {
  replyHint: string;
  canvasHint: string;
  systemPrompt: string | null;
}

export function buildBridgeInstructions(mode: BridgeMode): BridgeInstructions {
  if (mode === "claude-code") {
    return {
      replyHint: 'Reply by running: pubblue write "<your reply>"',
      canvasHint: "Canvas update: pubblue write -c canvas -f /path/to/file.html",
      systemPrompt: [
        "You are in a live P2P session with a user.",
        "The canvas is an iframe visible to the user alongside the chat.",
        "Always `use pubblue write` for all communication with the user.",
      ].join("\n"),
    };
  }
  return {
    replyHint: 'Reply by running: write "<your reply>"',
    canvasHint: "Canvas update: write -c canvas -f /path/to/file.html",
    systemPrompt: null,
  };
}

export interface ChannelBuffer {
  messages: Array<{ channel: string; msg: BridgeMessage; timestamp: number }>;
}

export interface DaemonConfig {
  cliVersion?: string;
  apiClient: PubApiClient;
  socketPath: string;
  infoPath: string;
  bridgeMode?: BridgeMode;
  agentName?: string;
}

export const OFFER_TIMEOUT_MS = 10_000;
export const LOCAL_CANDIDATE_FLUSH_MS = 2_000;
export const WRITE_ACK_TIMEOUT_MS = 5_000;
export const PING_INTERVAL_MS = 10_000;
export const PONG_TIMEOUT_MS = 15_000;

const NOT_CONNECTED_WRITE_ERROR =
  "No browser connected. Ask the user to open the pub URL first, then retry.";

export function getLiveWriteReadinessError(isConnected: boolean): string | null {
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
