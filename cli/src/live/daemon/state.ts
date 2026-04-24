import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import type { LiveModelProfile } from "../../../../shared/live-model-profile";
import type {
  LiveAgentActivity,
  LiveAgentState,
  LiveConnectionState,
  LiveExecutorState,
  LiveRuntimeStateSnapshot,
} from "../../../../shared/live-runtime-state-core";
import { IDLE_LIVE_RUNTIME_STATE } from "../../../../shared/live-runtime-state-core";
import type { BridgeRunner } from "../bridge/shared.js";
import type { AdapterPeerConnection, DataChannelLike } from "../transport/webrtc-adapter.js";

export type ActiveLiveSessionPaths = {
  liveSessionId: string;
  pubId: string;
  workspaceCanvasDir: string;
  attachmentDir: string;
  artifactsDir: string;
};

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
  /** All live data channels indexed by name. Each name may have multiple
   *  concurrent endpoints — e.g. the WebRTC peer (iframe) and the tunnel
   *  websocket (shell) both open `chat` and `_control`. Outbound traffic
   *  fans out across every open DC in the set so every endpoint sees it. */
  channels: Map<string, Set<DataChannelLike>>;
  /** Subset of `channels`: data channels owned by the current WebRTC peer.
   *  Used to route binary streams and to target peer-specific sends without
   *  tagging the `DataChannelLike` interface itself. */
  peerDataChannels: WeakSet<DataChannelLike>;
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
  activeLiveSession: ActiveLiveSessionPaths | null;
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
    peerDataChannels: new WeakSet(),
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
    activeLiveSession: null,
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

export function setDaemonAgentActivity(state: DaemonState, agentActivity: LiveAgentActivity): void {
  state.runtimeState = { ...state.runtimeState, agentActivity };
}

export function setDaemonExecutorState(state: DaemonState, executorState: LiveExecutorState): void {
  state.runtimeState = { ...state.runtimeState, executorState };
}
