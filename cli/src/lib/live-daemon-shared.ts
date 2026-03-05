import { type BridgeMessage, CHANNELS } from "../../../shared/bridge-protocol-core";
import type { PubApiClient } from "./api.js";

export type BridgeMode = "openclaw" | "claude-code";

export interface BridgeInstructions {
  replyHint: string;
  canvasHint: string;
  systemPrompt: string | null;
}

export function buildBridgeInstructions(mode: BridgeMode): BridgeInstructions {
  if (mode === "claude-code") {
    return {
      replyHint: 'Reply command: pubblue write "<your reply>"',
      canvasHint: "Canvas command: pubblue write -c canvas -f /path/to/file.html",
      systemPrompt: [
        "You are in a live pub.blue session with a user.",
        "The user sees chat and a canvas iframe.",
        "Always communicate by running `pubblue write` commands.",
        "Use canvas for output; use chat for short replies.",
      ].join("\n"),
    };
  }
  return {
    replyHint: 'Reply command: write "<your reply>"',
    canvasHint: "Canvas command: write -c canvas -f /path/to/file.html",
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

export function readCanvasHtmlFromOutbound(params: {
  channel: string;
  msg: BridgeMessage;
}): string | null {
  if (params.channel !== CHANNELS.CANVAS) return null;
  if (params.msg.type !== "html") return null;
  if (typeof params.msg.data !== "string") return null;
  if (params.msg.data.length === 0) return null;
  return params.msg.data;
}
