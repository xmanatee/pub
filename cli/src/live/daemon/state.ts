import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import { IDLE_LIVE_RUNTIME_STATE } from "../../../../shared/live-runtime-state-core";
import type {
  LiveAgentActivity,
  LiveAgentState,
  LiveConnectionState,
  LiveExecutorState,
  LiveRuntimeStateSnapshot,
} from "../../../../shared/live-runtime-state-core";
import type { LiveModelProfile } from "../../../../shared/live-model-profile";
import type { BridgeRunner } from "../bridge/shared.js";
import type { AdapterDataChannel, AdapterPeerConnection } from "../transport/webrtc-adapter.js";

export type PendingOutboundAck = {
  channel: string;
  messageId: string;
  failCount: number;
};

export type PendingDeliveryAck = {
  resolve: (received: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type DaemonState = {
  stopped: boolean;
  runtimeState: LiveRuntimeStateSnapshot;
  agentPreparing: Promise<void> | null;
  bridgeAbort: AbortController | null;
  /** Slug the bridge runner is currently serving. Set after the bridge starts,
   *  cleared before teardown. Canvas writes target this slug — it stays correct
   *  even when `signalingSlug` has already moved to a new session. */
  bridgeSlug: string | null;
  bridgeOutboundBuffer: Array<{ channel: string; msg: BridgeMessage }>;
  recovering: boolean;
  /** Slug of the current WebRTC signaling session. Changes immediately when
   *  a new live request arrives — before the old bridge is torn down.
   *  Used for signaling decisions and status reporting, NOT for routing writes. */
  signalingSlug: string | null;
  activeLiveModelProfile: LiveModelProfile | null;
  lastAppliedBrowserOffer: string | null;
  lastBrowserCandidateCount: number;
  lastSentCandidateCount: number;
  localCandidates: string[];
  pendingOutboundAcks: Map<string, PendingOutboundAck>;
  pendingDeliveryAcks: Map<string, PendingDeliveryAck>;
  peer: AdapterPeerConnection | null;
  channels: Map<string, AdapterDataChannel>;
  pendingInboundBinaryMeta: Map<string, BridgeMessage>;
  inboundStreams: Map<string, { streamId: string; startedAt: number }>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  localCandidateInterval: ReturnType<typeof setInterval> | null;
  localCandidateStopTimer: ReturnType<typeof setTimeout> | null;
  healthCheckTimer: ReturnType<typeof setInterval> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  pongTimeout: ReturnType<typeof setTimeout> | null;
  lastError: string | null;
  bridgeRunner: BridgeRunner | null;
};

export function createDaemonState(): DaemonState {
  return {
    stopped: false,
    runtimeState: { ...IDLE_LIVE_RUNTIME_STATE },
    agentPreparing: null,
    bridgeAbort: null,
    bridgeSlug: null,
    bridgeOutboundBuffer: [],
    recovering: false,
    signalingSlug: null,
    activeLiveModelProfile: null,
    lastAppliedBrowserOffer: null,
    lastBrowserCandidateCount: 0,
    lastSentCandidateCount: 0,
    localCandidates: [],
    pendingOutboundAcks: new Map(),
    pendingDeliveryAcks: new Map(),
    peer: null,
    channels: new Map(),
    pendingInboundBinaryMeta: new Map(),
    inboundStreams: new Map(),
    heartbeatTimer: null,
    localCandidateInterval: null,
    localCandidateStopTimer: null,
    healthCheckTimer: null,
    pingTimer: null,
    pongTimeout: null,
    lastError: null,
    bridgeRunner: null,
  };
}

export function setDaemonConnectionState(
  state: DaemonState,
  connectionState: LiveConnectionState,
): void {
  state.runtimeState = { ...state.runtimeState, connectionState };
}

export function setDaemonAgentState(state: DaemonState, agentState: LiveAgentState): void {
  state.runtimeState = { ...state.runtimeState, agentState };
}

export function setDaemonAgentActivity(
  state: DaemonState,
  agentActivity: LiveAgentActivity,
): void {
  state.runtimeState = { ...state.runtimeState, agentActivity };
}

export function setDaemonExecutorState(state: DaemonState, executorState: LiveExecutorState): void {
  state.runtimeState = { ...state.runtimeState, executorState };
}
