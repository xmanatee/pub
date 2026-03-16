import {
  isLiveConnectionReady,
  type LiveConnectionState,
} from "../../../../shared/live-runtime-state-core";
import { PubApiError, type PubApiClient } from "../../core/api/client.js";
import type { BridgeSettings } from "../../core/config/index.js";
import BRIDGE_SYSTEM_PROMPT from "./prompts/bridge-system.md";
import CANVAS_COMMAND_PROTOCOL_GUIDE from "../bridge/prompts/canvas-command-protocol.md";

export type BridgeInstructions = {
  replyHint: string;
  canvasHint: string;
  systemPrompt: string | null;
  commandProtocolGuide: string;
};

const PUB_WRITE_REPLY_HINT = 'Reply command: pub write "<your reply>"';
const PUB_WRITE_CANVAS_HINT = "Canvas command: pub write -c canvas -f /path/to/file.html";
export function buildBridgeInstructions(): BridgeInstructions {
  return {
    replyHint: PUB_WRITE_REPLY_HINT,
    canvasHint: PUB_WRITE_CANVAS_HINT,
    systemPrompt: BRIDGE_SYSTEM_PROMPT.trimEnd(),
    commandProtocolGuide: CANVAS_COMMAND_PROTOCOL_GUIDE.trimEnd(),
  };
}

export type DaemonConfig = {
  cliVersion?: string;
  apiClient: PubApiClient;
  socketPath: string;
  infoPath: string;
  logPath?: string;
  bridgeSettings: BridgeSettings;
  agentName?: string;
};

export const OFFER_TIMEOUT_MS = 10_000;
export const LOCAL_CANDIDATE_FLUSH_MS = 2_000;
export const PING_INTERVAL_MS = 10_000;
export const PONG_TIMEOUT_MS = 15_000;

export function getLiveWriteReadinessError(connectionState: LiveConnectionState): string | null {
  return isLiveConnectionReady(connectionState)
    ? null
    : "Live session connection is not ready yet. Wait for the browser to connect, then retry.";
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

export function isPresenceExpiredError(error: unknown): boolean {
  return error instanceof PubApiError && error.code === "presence_not_online";
}

export function isPresenceOwnershipConflictError(error: unknown): boolean {
  return error instanceof PubApiError && error.code === "presence_api_key_in_use";
}
