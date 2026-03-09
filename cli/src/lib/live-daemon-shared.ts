import type { BridgeMessage } from "../../../shared/bridge-protocol-core";
import type { PubApiClient } from "./api.js";
import { CANVAS_COMMAND_PROTOCOL_GUIDE_MARKDOWN } from "./live-prompt-content.js";

export type BridgeMode = "openclaw" | "claude-code" | "claude-sdk";

export interface BridgeInstructions {
  replyHint: string;
  canvasHint: string;
  systemPrompt: string | null;
  commandProtocolGuide: string;
}

export function buildBridgeInstructions(mode: BridgeMode): BridgeInstructions {
  if (mode === "claude-code" || mode === "claude-sdk") {
    return {
      replyHint: 'Reply command: pubblue write "<your reply>"',
      canvasHint: "Canvas command: pubblue write -c canvas -f /path/to/file.html",
      systemPrompt: [
        "You are in a live pub.blue session with a user.",
        "The user sees chat and a canvas iframe.",
        "Always communicate by running `pubblue write` commands.",
        "Use canvas for output; use chat for short replies.",
        "Canvas supports inline local calls for interactive visualizations that may require refetching data or rerunning local tools.",
        "When needed, include command-manifest actions so browser interactions can call the daemon and receive results back in canvas.",
        "Follow the Canvas Command Channel protocol from the session briefing exactly.",
      ].join("\n"),
      commandProtocolGuide: CANVAS_COMMAND_PROTOCOL_GUIDE_MARKDOWN,
    };
  }
  return {
    replyHint: 'Reply command: write "<your reply>"',
    canvasHint: "Canvas command: write -c canvas -f /path/to/file.html",
    systemPrompt: null,
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
  bridgeMode?: BridgeMode;
  agentName?: string;
}

export const OFFER_TIMEOUT_MS = 10_000;
export const LOCAL_CANDIDATE_FLUSH_MS = 2_000;
export const WRITE_ACK_TIMEOUT_MS = 5_000;
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

