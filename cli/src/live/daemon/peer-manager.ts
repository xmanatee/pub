import type { LiveModelProfile } from "../../../../shared/live-model-profile";
import { WEBRTC_STUN_URLS } from "../../../../shared/webrtc-transport-core";
import { createPeerConnection } from "../transport/webrtc-adapter.js";
import { createAnswer } from "./answer.js";
import { LOCAL_CANDIDATE_FLUSH_MS, OFFER_TIMEOUT_MS } from "./shared.js";
import type { DaemonState } from "./state.js";

export function createPeerManager(params: {
  state: DaemonState;
  apiClient: {
    signalAnswer: (args: {
      slug: string;
      daemonSessionId: string;
      answer?: string;
      candidates?: string[];
      agentName?: string;
    }) => Promise<void>;
  };
  daemonSessionId: string;
  agentName?: string;
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  setupChannel: (
    name: string,
    dc: ReturnType<NonNullable<DaemonState["peer"]>["createDataChannel"]>,
  ) => void;
  flushQueuedAcks: () => void;
  failPendingAcks: () => void;
  ensureBridgePrimed: () => Promise<void>;
  handleConnectionClosed: (reason: string) => void;
  clearLocalCandidateTimers: () => void;
  stopPingPong: () => void;
  commandHandlerStop: () => void;
  canvasFileTransferReset: () => void;
}) {
  const {
    state,
    apiClient,
    daemonSessionId,
    agentName,
    debugLog,
    markError,
    setupChannel,
    flushQueuedAcks,
    failPendingAcks,
    handleConnectionClosed,
    clearLocalCandidateTimers,
    stopPingPong,
    commandHandlerStop,
    canvasFileTransferReset,
  } = params;

  function attachPeerHandlers(currentPeer: NonNullable<DaemonState["peer"]>): void {
    currentPeer.onLocalCandidate((candidate: string, mid: string) => {
      if (state.stopped || currentPeer !== state.peer) return;
      state.localCandidates.push(JSON.stringify({ candidate, sdpMid: mid }));
    });

    currentPeer.onStateChange((peerState: string) => {
      if (state.stopped || currentPeer !== state.peer) return;
      debugLog(
        `peer state: ${peerState}${state.activeSlug ? ` slug=${state.activeSlug}` : ""}`,
      );
      if (peerState === "connected") {
        state.browserConnected = true;
        flushQueuedAcks();
        void params.ensureBridgePrimed();
        return;
      }
      if (peerState === "disconnected" || peerState === "failed" || peerState === "closed") {
        handleConnectionClosed(`peer-state:${peerState}`);
      }
    });

    currentPeer.onIceStateChange((iceState: string) => {
      if (state.stopped || currentPeer !== state.peer) return;
      debugLog(`ICE state: ${iceState}`);
      if ((iceState === "disconnected" || iceState === "failed") && state.browserConnected) {
        handleConnectionClosed(`ice-state:${iceState}`);
      }
    });

    currentPeer.onDataChannel((dc) => {
      if (state.stopped || currentPeer !== state.peer) return;
      setupChannel(
        dc.getLabel(),
        dc as ReturnType<NonNullable<DaemonState["peer"]>["createDataChannel"]>,
      );
    });
  }

  function createPeer(): void {
    const nextPeer = createPeerConnection({ iceServers: [...WEBRTC_STUN_URLS] });
    state.peer = nextPeer;
    state.channels = new Map();
    state.pendingInboundBinaryMeta = new Map();
    state.inboundStreams = new Map();
    state.seenInboundMessageKeys = new Set();
    attachPeerHandlers(nextPeer);
  }

  async function closeCurrentPeer(): Promise<void> {
    failPendingAcks();
    for (const dc of state.channels.values()) {
      try {
        dc.close();
      } catch (error) {
        debugLog("failed to close data channel cleanly", error);
      }
    }
    state.channels.clear();
    state.pendingInboundBinaryMeta.clear();
    state.inboundStreams.clear();
    state.seenInboundMessageKeys.clear();
    if (state.peer) {
      try {
        await state.peer.close();
      } catch (error) {
        debugLog("failed to close peer connection cleanly", error);
      }
      state.peer = null;
    }
  }

  function resetNegotiationState(): void {
    state.browserConnected = false;
    state.bridgePrimed = false;
    state.bridgePriming = null;
    state.buffer.messages = [];
    state.activeLiveModelProfile = null;
    failPendingAcks();
    stopPingPong();
    state.lastAppliedBrowserOffer = null;
    state.lastBrowserCandidateCount = 0;
    state.lastSentCandidateCount = 0;
    state.localCandidates.length = 0;
    clearLocalCandidateTimers();
    state.inboundStreams.clear();
    state.seenInboundMessageKeys.clear();
  }

  async function clearActiveLiveSession(reason: string): Promise<void> {
    const slug = state.activeSlug;
    debugLog(`clearing active live session: ${reason}${slug ? ` (${slug})` : ""}`);
    state.activeSlug = null;
    commandHandlerStop();
    canvasFileTransferReset();
    await closeCurrentPeer();
    resetNegotiationState();
  }

  function startLocalCandidateFlush(slug: string): void {
    clearLocalCandidateTimers();
    state.localCandidateInterval = setInterval(async () => {
      if (state.localCandidates.length <= state.lastSentCandidateCount) return;
      const nextCandidates = state.localCandidates.slice(state.lastSentCandidateCount);
      state.lastSentCandidateCount = state.localCandidates.length;
      await apiClient
        .signalAnswer({ slug, daemonSessionId, candidates: nextCandidates })
        .catch((error) => {
          debugLog("failed to publish local ICE candidates", error);
        });
    }, LOCAL_CANDIDATE_FLUSH_MS);

    state.localCandidateStopTimer = setTimeout(() => {
      clearLocalCandidateTimers();
    }, 30_000);
  }

  async function handleIncomingLive(
    slug: string,
    browserOffer: string,
    modelProfile?: LiveModelProfile,
  ): Promise<void> {
    if (state.recovering) return;
    state.recovering = true;

    try {
      const t0 = Date.now();
      debugLog(
        `incoming live slug=${slug}${modelProfile ? ` modelProfile=${modelProfile}` : ""}`,
      );
      await clearActiveLiveSession("incoming-live-recovery");
      debugLog(`[profile] cleared old session in ${Date.now() - t0}ms`);
      createPeer();
      if (!state.peer) throw new Error("PeerConnection not initialized");

      const tAnswer = Date.now();
      const answer = await createAnswer(state.peer, browserOffer, OFFER_TIMEOUT_MS);
      debugLog(`[profile] answer created in ${Date.now() - tAnswer}ms`);
      state.lastAppliedBrowserOffer = browserOffer;
      state.activeSlug = slug;
      state.activeLiveModelProfile = modelProfile ?? null;

      const tSignal = Date.now();
      await apiClient.signalAnswer({ slug, daemonSessionId, answer, agentName });
      debugLog(`[profile] answer posted in ${Date.now() - tSignal}ms (total ${Date.now() - t0}ms)`);
      startLocalCandidateFlush(slug);
    } catch (error) {
      markError("failed to handle incoming live request", error);
    } finally {
      state.recovering = false;
    }
  }

  async function applyBrowserCandidates(candidatePayloads: string[]): Promise<void> {
    for (const candidatePayload of candidatePayloads) {
      try {
        const parsed = JSON.parse(candidatePayload) as { candidate?: unknown; sdpMid?: unknown };
        if (typeof parsed.candidate !== "string" || !state.peer) continue;
        const sdpMid = typeof parsed.sdpMid === "string" ? parsed.sdpMid : "0";
        await state.peer.addRemoteCandidate(parsed.candidate, sdpMid);
      } catch (error) {
        debugLog("failed to parse/apply browser ICE candidate", error);
      }
    }
  }

  return {
    applyBrowserCandidates,
    clearActiveLiveSession,
    closeCurrentPeer,
    createPeer,
    handleIncomingLive,
    resetNegotiationState,
    startLocalCandidateFlush,
  };
}
