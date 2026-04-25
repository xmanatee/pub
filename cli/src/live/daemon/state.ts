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

/** What the bridge runner is currently bound to.
 *
 *  Pub-flow sessions originate from a Convex `connections` row negotiated over
 *  WebRTC: the agent renders a specific pub's content. Tunnel-flow sessions
 *  originate from the browser opening a relay tunnel into a long-lived
 *  workspace (the super-app); there is no slug, no Convex round-trip, and no
 *  publishing — the agent edits files in place and Vite HMR reflects the
 *  changes in the iframe.
 *
 *  Encoded as a discriminated union so callers can never read a pub-only field
 *  on a tunnel session (or vice versa). */
export type ActiveSession =
  | {
      kind: "pub";
      slug: string;
      pubId: string;
      liveSessionId: string;
      workspaceCanvasDir: string;
      attachmentDir: string;
      artifactsDir: string;
    }
  | {
      kind: "tunnel";
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
  /** Incremented every time `ensureAgentReady` accepts a new intent. Lets a
   *  long-running preparation detect that a newer intent has superseded it
   *  (pub→pub slug change, pub→tunnel handoff, etc.) without coupling the
   *  staleness check to any pub-only field. */
  bridgePrepGeneration: number;
  bridgeAbort: AbortController | null;
  /** Outbound messages produced by the bridge runner while the connection is
   *  not yet ready to send. Drained by `flushOutboundBuffer` once we go ready. */
  bridgeOutboundBuffer: Array<{ channel: string; msg: BridgeMessage }>;
  /** Inbound messages received on data channels while the bridge runner is
   *  still preparing. Drained into the runner once it's ready. Bounded so a
   *  flood during prep cannot grow without bound. */
  bridgeInboundBuffer: Array<{ channel: string; msg: BridgeMessage }>;
  recovering: boolean;
  /** Slug of the current WebRTC signaling session. Pub-flow only — tunnel
   *  sessions never set this. Changes immediately when a new browser offer
   *  arrives, before the bridge has been retargeted. */
  signalingSlug: string | null;
  /** Model profile carried by the most recent pub-flow signaling snapshot.
   *  Threaded into the bridge runner config when the pub bridge starts.
   *  Pub-flow only. */
  signalingModelProfile: LiveModelProfile | null;
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
  /** What the bridge runner is currently serving. `null` exactly when
   *  `bridgeRunner` is `null`. Stays set across pub-flow signaling drops so
   *  the bridge can survive transient WebRTC reconnects. */
  activeSession: ActiveSession | null;
};

export function createDaemonState(): DaemonState {
  return {
    stopped: false,
    runtimeState: { ...IDLE_LIVE_RUNTIME_STATE },
    agentPreparing: null,
    bridgePrepGeneration: 0,
    bridgeAbort: null,
    bridgeOutboundBuffer: [],
    bridgeInboundBuffer: [],
    recovering: false,
    signalingSlug: null,
    signalingModelProfile: null,
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
    activeSession: null,
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
