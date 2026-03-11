import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import type { PubApiClient } from "../../core/api/client.js";
import type { BridgeSettings } from "../../core/config/index.js";
import BRIDGE_SYSTEM_PROMPT from "./prompts/bridge-system.md";
import CANVAS_COMMAND_PROTOCOL_GUIDE from "../bridge/prompts/canvas-command-protocol.md";

export interface BridgeInstructions {
  replyHint: string;
  canvasHint: string;
  systemPrompt: string | null;
  commandProtocolGuide: string;
}

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

export interface ChannelBuffer {
  messages: Array<{ channel: string; msg: BridgeMessage; timestamp: number }>;
}

export interface DaemonConfig {
  cliVersion?: string;
  apiClient: PubApiClient;
  socketPath: string;
  infoPath: string;
  logPath?: string;
  bridgeSettings: BridgeSettings;
  agentName?: string;
}

export const OFFER_TIMEOUT_MS = 10_000;
export const LOCAL_CANDIDATE_FLUSH_MS = 2_000;
export const PING_INTERVAL_MS = 10_000;
export const PONG_TIMEOUT_MS = 15_000;

export function getLiveWriteReadinessError(isReady: boolean): string | null {
  return isReady
    ? null
    : "Live session is not established yet. Wait for browser connect and initial context sync, then retry.";
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
