import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import type { PubApiClient } from "../../core/api/client.js";
import type { BridgeSettings } from "../../core/config/index.js";
import { CANVAS_COMMAND_PROTOCOL_GUIDE_MARKDOWN } from "../bridge/prompt-content.js";

export interface BridgeInstructions {
  replyHint: string;
  canvasHint: string;
  systemPrompt: string | null;
  commandProtocolGuide: string;
}

const PUB_WRITE_REPLY_HINT = 'Reply command: pub write "<your reply>"';
const PUB_WRITE_CANVAS_HINT = "Canvas command: pub write -c canvas -f /path/to/file.html";
const BRIDGE_SYSTEM_PROMPT = [
  "You are in a live pub.blue session with a user.",
  "The user sees chat and a canvas iframe.",
  "Always communicate by running `pub write` commands.",
  "Use canvas for output; use chat for short replies.",
  "Canvas supports inline local calls for interactive visualizations that may require refetching data or rerunning local tools.",
  "When needed, include command-manifest actions so browser interactions can call the daemon and receive results back in canvas.",
  "Follow the Canvas Command Channel protocol from the session briefing exactly.",
].join("\n");

export function buildBridgeInstructions(): BridgeInstructions {
  return {
    replyHint: PUB_WRITE_REPLY_HINT,
    canvasHint: PUB_WRITE_CANVAS_HINT,
    systemPrompt: BRIDGE_SYSTEM_PROMPT,
    commandProtocolGuide: CANVAS_COMMAND_PROTOCOL_GUIDE_MARKDOWN,
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
