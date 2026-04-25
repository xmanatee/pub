import { describe, expect, it, vi } from "vitest";
import { encodeSessionDescription } from "../../../../shared/webrtc-negotiation-core";
import { createPeerManager } from "./peer-manager.js";
import { createDaemonState } from "./state.js";

type StateChangeCallback = (state: string) => void;
type IceStateChangeCallback = (state: string) => void;
type LocalDescriptionCallback = (sdp: string, type: string) => void;
type GatheringStateChangeCallback = (state: string) => void;

function makeMockPeer() {
  let stateChangeCb: StateChangeCallback | null = null;
  let iceStateChangeCb: IceStateChangeCallback | null = null;
  let localDescriptionCb: LocalDescriptionCallback | null = null;
  let gatheringStateCb: GatheringStateChangeCallback | null = null;
  let localDescription: { sdp: string; type: string } | null = null;

  return {
    onLocalCandidate: vi.fn(),
    onLocalDescription: vi.fn((cb: LocalDescriptionCallback) => {
      localDescriptionCb = cb;
    }),
    onGatheringStateChange: vi.fn((cb: GatheringStateChangeCallback) => {
      gatheringStateCb = cb;
    }),
    onStateChange: vi.fn((cb: StateChangeCallback) => {
      stateChangeCb = cb;
    }),
    onIceStateChange: vi.fn((cb: IceStateChangeCallback) => {
      iceStateChangeCb = cb;
    }),
    onDataChannel: vi.fn(),
    close: vi.fn(async () => {}),
    createDataChannel: vi.fn(),
    addRemoteCandidate: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {
      localDescription = { sdp: "answer-sdp", type: "answer" };
      localDescriptionCb?.(localDescription.sdp, localDescription.type);
      gatheringStateCb?.("complete");
    }),
    createAnswer: vi.fn(async () => "answer"),
    localDescription: vi.fn(() => localDescription),
    emitStateChange: (state: string) => stateChangeCb?.(state),
    emitIceStateChange: (state: string) => iceStateChangeCb?.(state),
  };
}

const mockPeerRef = vi.hoisted(() => ({ current: null as ReturnType<typeof makeMockPeer> | null }));

vi.mock("../transport/webrtc-adapter.js", () => ({
  createPeerConnection: () => mockPeerRef.current,
}));

function createTestPeerManager() {
  const mockPeer = makeMockPeer();
  mockPeerRef.current = mockPeer;
  const state = createDaemonState();
  const handleConnectionClosed = vi.fn();
  const ensureAgentReady = vi.fn(async () => {});
  const flushQueuedAcks = vi.fn();
  const startPingPong = vi.fn();
  const markError = vi.fn();
  const commandHandlerBeginManifestLoad = vi.fn();

  const manager = createPeerManager({
    state,
    apiClient: {
      signalAnswer: vi.fn(async () => {}),
      getIceServers: vi.fn(async () => [{ urls: "stun:stun.l.google.com:19302" }]),
    },
    daemonSessionId: "test-session",
    debugLog: vi.fn(),
    markError,
    setupChannel: vi.fn(),
    flushQueuedAcks,
    failPendingAcks: vi.fn(),
    resetMessageDedup: vi.fn(),
    clearAgentPreparation: vi.fn(),
    ensureAgentReady,
    handleConnectionClosed,
    clearLocalCandidateTimers: vi.fn(),
    startPingPong,
    stopPingPong: vi.fn(),
    commandHandlerBeginManifestLoad,
    commandHandlerStop: vi.fn(),
    pubFsHandlerReset: vi.fn(),
  });

  manager.createPeer([{ urls: "stun:stun.l.google.com:19302" }]);

  return {
    manager,
    mockPeer,
    state,
    handleConnectionClosed,
    ensureAgentReady,
    flushQueuedAcks,
    startPingPong,
    markError,
    commandHandlerBeginManifestLoad,
  };
}

describe("peer-manager state transitions", () => {
  it("onStateChange('disconnected') does NOT call handleConnectionClosed", () => {
    const { mockPeer, handleConnectionClosed } = createTestPeerManager();
    mockPeer.emitStateChange("disconnected");
    expect(handleConnectionClosed).not.toHaveBeenCalled();
  });

  it("onStateChange('failed') calls handleConnectionClosed", () => {
    const { mockPeer, handleConnectionClosed } = createTestPeerManager();
    mockPeer.emitStateChange("failed");
    expect(handleConnectionClosed).toHaveBeenCalledWith("peer-state:failed");
  });

  it("onStateChange('closed') calls handleConnectionClosed", () => {
    const { mockPeer, handleConnectionClosed } = createTestPeerManager();
    mockPeer.emitStateChange("closed");
    expect(handleConnectionClosed).toHaveBeenCalledWith("peer-state:closed");
  });

  it("onStateChange('connected') calls ensureAgentReady and startPingPong with the active pub intent", () => {
    const { mockPeer, ensureAgentReady, flushQueuedAcks, startPingPong, state } =
      createTestPeerManager();
    state.signalingSlug = "demo-slug";
    state.signalingModelProfile = "fast";
    mockPeer.emitStateChange("connected");
    expect(flushQueuedAcks).toHaveBeenCalled();
    expect(startPingPong).toHaveBeenCalled();
    expect(ensureAgentReady).toHaveBeenCalledWith({
      kind: "pub",
      slug: "demo-slug",
      modelProfile: "fast",
    });
  });

  it("onStateChange('connected') without a signalingSlug logs an error and skips agent prep", () => {
    const { mockPeer, ensureAgentReady, startPingPong, markError } = createTestPeerManager();
    mockPeer.emitStateChange("connected");
    expect(ensureAgentReady).not.toHaveBeenCalled();
    expect(startPingPong).not.toHaveBeenCalled();
    expect(markError).toHaveBeenCalledWith(
      expect.stringContaining("without an active signaling slug"),
    );
  });

  it("onIceStateChange('disconnected') does NOT call handleConnectionClosed", () => {
    const { mockPeer, handleConnectionClosed } = createTestPeerManager();
    mockPeer.emitIceStateChange("disconnected");
    expect(handleConnectionClosed).not.toHaveBeenCalled();
  });

  it("onIceStateChange('failed') calls handleConnectionClosed when connection is ready", () => {
    const { mockPeer, handleConnectionClosed } = createTestPeerManager();
    mockPeer.emitStateChange("connected");
    handleConnectionClosed.mockClear();
    mockPeer.emitIceStateChange("failed");
    expect(handleConnectionClosed).toHaveBeenCalledWith("ice-state:failed");
  });

  it("marks commands as loading as soon as a new live session starts negotiating", async () => {
    const { manager, commandHandlerBeginManifestLoad, state } = createTestPeerManager();

    const browserOffer = encodeSessionDescription({
      sdp: "browser-offer-sdp",
      type: "offer",
    });
    await manager.handleIncomingLive("demo-slug", browserOffer);

    expect(state.signalingSlug).toBe("demo-slug");
    expect(commandHandlerBeginManifestLoad).toHaveBeenCalledTimes(1);
  });
});
