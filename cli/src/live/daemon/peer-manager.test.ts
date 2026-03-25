import { describe, expect, it, vi } from "vitest";
import { createPeerManager } from "./peer-manager.js";
import { createDaemonState } from "./state.js";

type StateChangeCallback = (state: string) => void;
type IceStateChangeCallback = (state: string) => void;

function makeMockPeer() {
  let stateChangeCb: StateChangeCallback | null = null;
  let iceStateChangeCb: IceStateChangeCallback | null = null;

  return {
    onLocalCandidate: vi.fn(),
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
    setRemoteDescription: vi.fn(async () => {}),
    createAnswer: vi.fn(async () => "answer"),
    getLocalDescription: vi.fn(() => null),
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

  const manager = createPeerManager({
    state,
    apiClient: {
      signalAnswer: vi.fn(async () => {}),
      getIceServers: vi.fn(async () => [{ urls: "stun:stun.l.google.com:19302" }]),
    },
    daemonSessionId: "test-session",
    debugLog: vi.fn(),
    markError: vi.fn(),
    setupChannel: vi.fn(),
    flushQueuedAcks,
    failPendingAcks: vi.fn(),
    resetMessageDedup: vi.fn(),
    clearAgentPreparation: vi.fn(),
    ensureAgentReady,
    handleConnectionClosed,
    clearLocalCandidateTimers: vi.fn(),
    stopPingPong: vi.fn(),
    commandHandlerStop: vi.fn(),
    pubFsHandlerReset: vi.fn(),
  });

  manager.createPeer([{ urls: "stun:stun.l.google.com:19302" }]);

  return { mockPeer, state, handleConnectionClosed, ensureAgentReady, flushQueuedAcks };
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

  it("onStateChange('connected') calls ensureAgentReady and flushQueuedAcks", () => {
    const { mockPeer, ensureAgentReady, flushQueuedAcks } = createTestPeerManager();
    mockPeer.emitStateChange("connected");
    expect(flushQueuedAcks).toHaveBeenCalled();
    expect(ensureAgentReady).toHaveBeenCalled();
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
});
