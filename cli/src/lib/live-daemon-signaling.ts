import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { type LiveInfo, parseLiveInfo } from "../../../shared/live-api-core";
import type { PubApiClient } from "./api.js";
import { decideSignalingUpdate } from "./live-signaling.js";

const LIVE_SIGNAL_QUERY = makeFunctionReference<
  "query",
  { apiKey: string; daemonSessionId: string },
  LiveInfo | null
>("pubs:getLiveForAgentByApiKey");

export function parseLiveSnapshot(result: unknown): LiveInfo | null {
  const live = parseLiveInfo(result);
  if (result !== null && result !== undefined && live === null) {
    throw new Error("Invalid signaling snapshot: expected object or null");
  }
  return live;
}

interface SignalingControllerParams {
  apiClient: PubApiClient;
  daemonSessionId: string;
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  isStopped: () => boolean;
  getActiveSlug: () => string | null;
  getLastAppliedBrowserOffer: () => string | null;
  getLastBrowserCandidateCount: () => number;
  setLastBrowserCandidateCount: (count: number) => void;
  onRecover: (slug: string, browserOffer: string) => Promise<void>;
  onApplyBrowserCandidates: (candidatePayloads: string[]) => Promise<void>;
}

export interface SignalingController {
  start(): void;
  stop(): Promise<void>;
  status(): { known: boolean; open: boolean };
}

export function createSignalingController(params: SignalingControllerParams): SignalingController {
  const {
    apiClient,
    daemonSessionId,
    debugLog,
    markError,
    isStopped,
    getActiveSlug,
    getLastAppliedBrowserOffer,
    getLastBrowserCandidateCount,
    setLastBrowserCandidateCount,
    onRecover,
    onApplyBrowserCandidates,
  } = params;

  let signalingClient: ConvexClient | null = null;
  let signalingUnsubscribe: (() => void) | null = null;
  let connectionStateUnsubscribe: (() => void) | null = null;
  let signalingQueue: Promise<void> = Promise.resolve();
  let signalingConnectionKnown = false;
  let signalingConnectionOpen = false;

  function status() {
    return { known: signalingConnectionKnown, open: signalingConnectionOpen };
  }

  function observeSignalingConnectionState(state: {
    isWebSocketConnected: boolean;
    connectionCount: number;
    connectionRetries: number;
  }): void {
    if (!signalingConnectionKnown) {
      signalingConnectionKnown = true;
      signalingConnectionOpen = state.isWebSocketConnected;
      debugLog(
        `signaling websocket initial state: ${state.isWebSocketConnected ? "connected" : "disconnected"}`,
      );
      return;
    }

    if (state.isWebSocketConnected !== signalingConnectionOpen) {
      signalingConnectionOpen = state.isWebSocketConnected;
      if (state.isWebSocketConnected) {
        debugLog("signaling websocket reconnected");
      } else {
        markError(
          `signaling websocket disconnected (retries=${state.connectionRetries}, connections=${state.connectionCount})`,
        );
      }
    }
  }

  async function handleSignalingSnapshot(live: LiveInfo | null): Promise<void> {
    const decision = decideSignalingUpdate({
      live,
      activeSlug: getActiveSlug(),
      lastAppliedBrowserOffer: getLastAppliedBrowserOffer(),
      lastBrowserCandidateCount: getLastBrowserCandidateCount(),
    });

    setLastBrowserCandidateCount(decision.nextBrowserCandidateCount);

    if (decision.type === "recover") {
      await onRecover(decision.slug, decision.browserOffer);
      return;
    }

    if (decision.type === "apply-browser-candidates") {
      await onApplyBrowserCandidates(decision.candidatePayloads);
    }
  }

  function enqueueSignalingSnapshot(live: LiveInfo | null): void {
    signalingQueue = signalingQueue
      .then(async () => {
        if (isStopped()) return;
        await handleSignalingSnapshot(live);
      })
      .catch((error) => {
        markError("failed to process signaling snapshot", error);
      });
  }

  function start(): void {
    if (signalingClient) return;
    signalingClient = new ConvexClient(apiClient.getConvexCloudUrl(), {
      onServerDisconnectError: (message) => {
        markError(`signaling server disconnect: ${message}`);
      },
    });

    connectionStateUnsubscribe = signalingClient.subscribeToConnectionState((state) => {
      observeSignalingConnectionState({
        isWebSocketConnected: state.isWebSocketConnected,
        connectionCount: state.connectionCount,
        connectionRetries: state.connectionRetries,
      });
    });

    const unsubscribe = signalingClient.onUpdate(
      LIVE_SIGNAL_QUERY,
      { apiKey: apiClient.getApiKey(), daemonSessionId },
      (result) => {
        let live: LiveInfo | null;
        try {
          live = parseLiveSnapshot(result);
        } catch (error) {
          markError("received malformed signaling snapshot", error);
          return;
        }
        enqueueSignalingSnapshot(live);
      },
      (error) => {
        markError("signaling subscription failed", error);
      },
    );
    signalingUnsubscribe = () => unsubscribe();
  }

  async function stop(): Promise<void> {
    if (signalingUnsubscribe) {
      signalingUnsubscribe();
      signalingUnsubscribe = null;
    }
    if (connectionStateUnsubscribe) {
      connectionStateUnsubscribe();
      connectionStateUnsubscribe = null;
    }
    if (signalingClient) {
      await signalingClient.close().catch((error) => {
        debugLog("failed to close signaling client cleanly", error);
      });
      signalingClient = null;
    }
    signalingConnectionKnown = false;
    signalingConnectionOpen = false;
  }

  return {
    start,
    stop,
    status,
  };
}
