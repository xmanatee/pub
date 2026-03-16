import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import { IDLE_LIVE_RUNTIME_STATE } from "../../../../shared/live-runtime-state-core";
import type {
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
  bridgeSlug: string | null;
  bridgeOutboundBuffer: Array<{ channel: string; msg: BridgeMessage }>;
  recovering: boolean;
  activeSlug: string | null;
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
  inboundStreams: Map<string, { streamId: string }>;
  seenInboundMessageKeys: Set<string>;
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
    activeSlug: null,
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
    seenInboundMessageKeys: new Set(),
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
  if (connectionState === "connected") {
    state.runtimeState = { ...state.runtimeState, connectionState };
  } else {
    state.runtimeState = { connectionState, agentState: "idle", executorState: "idle" };
  }
}

export function setDaemonAgentState(state: DaemonState, agentState: LiveAgentState): void {
  if (agentState !== "idle" && state.runtimeState.connectionState !== "connected") return;
  if (agentState === "ready") {
    state.runtimeState = { ...state.runtimeState, agentState };
  } else {
    state.runtimeState = { ...state.runtimeState, agentState, executorState: "idle" };
  }
}

export function setDaemonExecutorState(state: DaemonState, executorState: LiveExecutorState): void {
  if (executorState !== "idle" && state.runtimeState.agentState !== "ready") return;
  state.runtimeState = { ...state.runtimeState, executorState };
}
