import {
  isLiveConnectionReady,
  type LiveConnectionState,
} from "../../../../shared/live-runtime-state-core";
import { type PubApiClient, PubApiError } from "../../core/api/client.js";
import type { BridgeSettings } from "../../core/config/index.js";

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
export const LOCAL_CANDIDATE_FLUSH_MS = 200;
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

export function isPresenceOwnershipConflictError(error: unknown): boolean {
  return error instanceof PubApiError && error.code === "presence_api_key_in_use";
}

export function isRateLimitError(error: unknown): boolean {
  return error instanceof PubApiError && error.status === 429;
}
