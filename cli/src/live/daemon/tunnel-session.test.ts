/**
 * Tunnel sessions activate the bridge from a path that has no Convex slug,
 * no SDP, and no peer connection state machine — they're just "the relay
 * tunnel got a `chat` channel message." These tests pin the regression where
 * tunnel chat silently disappeared because nothing in the daemon woke the
 * bridge for that flow.
 */
import { describe, expect, it, vi } from "vitest";
import { CHANNELS, makeTextMessage } from "../../../../shared/bridge-protocol-core";
import type { BridgeRunner } from "../bridge/shared.js";
import { createBridgeManager, type SessionIntent } from "./bridge-manager.js";
import { createDaemonChannelManager } from "./channel-manager.js";
import { createDaemonState, setDaemonConnectionState } from "./state.js";

const FAKE_TUNNEL_DIR = "/tmp/super-app-test";

vi.mock("../bridge/providers/registry.js", () => ({
  createBridgeRunnerForSettings: vi.fn(),
}));

vi.mock("../runtime/daemon-files.js", async () => {
  const actual = await vi.importActual<typeof import("../runtime/daemon-files.js")>(
    "../runtime/daemon-files.js",
  );
  return {
    ...actual,
    ensureTunnelSessionDirs: vi.fn(({ workspaceDir }: { workspaceDir: string }) => ({
      workspaceCanvasDir: workspaceDir,
      attachmentDir: `${workspaceDir}/.pub-attachments`,
      artifactsDir: `${workspaceDir}/.pub-artifacts`,
    })),
    hydrateSessionWorkspace: vi.fn(() => ({
      workspaceCanvasDir: "/tmp/pub-workspace",
      attachmentDir: "/tmp/pub-attachments",
      artifactsDir: "/tmp/pub-artifacts",
      pubCanvasDir: "/tmp/pub-canvas",
      liveSessionId: "session-1",
      pubId: "pub-1",
    })),
    removeLiveSessionDirs: vi.fn(),
    applyWorkspaceFiles: vi.fn((_dir: string, files: Record<string, string>) => files),
    readWorkspaceFiles: vi.fn(() => ({})),
    writeCanvasMirror: vi.fn(),
  };
});

interface FakeRunner extends BridgeRunner {
  receivedEntries: Array<{ channel: string; msg: ReturnType<typeof makeTextMessage> }>;
}

function makeFakeRunner(): FakeRunner {
  const received: FakeRunner["receivedEntries"] = [];
  return {
    receivedEntries: received,
    capabilities: { conversational: true },
    enqueue(entries) {
      received.push(...(entries as FakeRunner["receivedEntries"]));
    },
    stop: vi.fn(async () => {}),
    status: () => ({ running: true, forwardedMessages: received.length }),
  };
}

async function setupTunnelHarness(
  overrides: { apiClientGet?: (slug: string) => Promise<unknown> } = {},
) {
  const { createBridgeRunnerForSettings } = await import("../bridge/providers/registry.js");
  const state = createDaemonState();
  setDaemonConnectionState(state, "connected");

  const fakeRunner = makeFakeRunner();
  vi.mocked(createBridgeRunnerForSettings).mockResolvedValue(fakeRunner);

  const debugLog = vi.fn();
  const markError = vi.fn();

  const bridgeManager = createBridgeManager({
    state,
    bridgeSettings: { mode: "claude-code" } as never,
    agentName: "test-agent",
    commandHandler: {
      beginManifestLoad: vi.fn(),
      bindFromHtml: vi.fn(),
      clearBindings: vi.fn(),
    },
    apiClient: {
      get: overrides.apiClientGet ?? vi.fn(),
      update: vi.fn(),
    } as never,
    debugLog,
    markError,
    sendOutboundMessageWithAck: vi.fn(async () => true),
    publishRuntimeState: vi.fn(async () => true),
    emitDeliveryStatus: vi.fn(),
  });

  return { state, bridgeManager, fakeRunner, debugLog, markError };
}

describe("ensureAgentReady — tunnel intent", () => {
  it("starts a tunnel-flavoured bridge runner when the relay opens a chat channel", async () => {
    const { state, bridgeManager, fakeRunner } = await setupTunnelHarness();

    const intent: SessionIntent = { kind: "tunnel", workspaceDir: FAKE_TUNNEL_DIR };
    await bridgeManager.ensureAgentReady(intent);

    expect(state.activeSession).toEqual({
      kind: "tunnel",
      workspaceCanvasDir: FAKE_TUNNEL_DIR,
      attachmentDir: `${FAKE_TUNNEL_DIR}/.pub-attachments`,
      artifactsDir: `${FAKE_TUNNEL_DIR}/.pub-artifacts`,
    });
    expect(state.bridgeRunner).toBe(fakeRunner);
    expect(state.runtimeState.agentState).toBe("ready");
  });

  it("buffers inbound chat that lands during preparation and drains into the runner", async () => {
    const { state, bridgeManager, fakeRunner } = await setupTunnelHarness();

    const channelManager = createDaemonChannelManager({
      state,
      debugLog: vi.fn(),
      markError: vi.fn(),
      onCommandMessage: vi.fn(async () => {}),
      onPubFsMessage: vi.fn(async () => {}),
      getBridgeAcceptor: () => bridgeManager,
    });

    // Start tunnel prep but do not await it yet — simulate a chat message
    // arriving while the runner is being constructed.
    state.agentPreparing = bridgeManager.ensureAgentReady({
      kind: "tunnel",
      workspaceDir: FAKE_TUNNEL_DIR,
    });

    const dc = makeMockChannel(CHANNELS.CHAT);
    channelManager.setupChannel(CHANNELS.CHAT, dc as never);
    dc.emitOpen();

    const earlyMessage = makeTextMessage("are you there?");
    dc.emitMessage(JSON.stringify(earlyMessage));

    // The inbound message landed before the runner existed. It must have been
    // buffered, not silently dropped on a null bridgeRunner.
    expect(state.bridgeInboundBuffer).toHaveLength(1);

    await state.agentPreparing;

    // Once preparation completes, the buffer drains into the runner.
    expect(state.bridgeInboundBuffer).toHaveLength(0);
    expect(fakeRunner.receivedEntries).toHaveLength(1);
    expect(fakeRunner.receivedEntries[0]?.msg.id).toBe(earlyMessage.id);
  });

  it("rejects inbound chat when there is no active session and no preparation in flight", async () => {
    const state = createDaemonState();
    setDaemonConnectionState(state, "connected");
    const acceptor = { tryAcceptInbound: () => "rejected" as const };

    const channelManager = createDaemonChannelManager({
      state,
      debugLog: vi.fn(),
      markError: vi.fn(),
      onCommandMessage: vi.fn(async () => {}),
      onPubFsMessage: vi.fn(async () => {}),
      getBridgeAcceptor: () => acceptor,
    });

    const dc = makeMockChannel(CHANNELS.CHAT);
    channelManager.setupChannel(CHANNELS.CHAT, dc as never);
    dc.emitOpen();
    const sentControl: string[] = [];
    const controlDc = makeMockChannel("_control", (msg) => sentControl.push(msg));
    channelManager.setupChannel("_control", controlDc as never);
    controlDc.emitOpen();

    const msg = makeTextMessage("anyone home?");
    dc.emitMessage(JSON.stringify(msg));

    await flushTasks();

    // The browser must see a `delivery: failed` so the UI can surface the
    // dropped message. The pre-fix bug emitted `received` here, which was a
    // lie that masked the missing bridge.
    const deliveryEvents = sentControl
      .map((raw) => JSON.parse(raw) as { type: string; data?: unknown; meta?: { stage?: string } })
      .filter((entry) => entry?.type === "event" && entry?.data === "delivery");
    expect(deliveryEvents.some((entry) => entry.meta?.stage === "failed")).toBe(true);
    expect(deliveryEvents.some((entry) => entry.meta?.stage === "received")).toBe(false);
  });

  it("preempts an in-flight pub preparation when a tunnel intent arrives", async () => {
    // A pub preparation that hangs forever inside fetchPubSessionContent: the
    // tunnel intent must abort/supersede it and win, leaving the active
    // session as the tunnel one rather than the (never-completing) pub one.
    const { state, bridgeManager } = await setupTunnelHarness({
      apiClientGet: () => new Promise(() => {}),
    });

    const pubIntent: SessionIntent = { kind: "pub", slug: "pub-x", modelProfile: null };
    const tunnelIntent: SessionIntent = { kind: "tunnel", workspaceDir: FAKE_TUNNEL_DIR };

    // Fire-and-forget pub prep — it hangs forever inside fetchPubSessionContent.
    // The .catch swallows the rejection so vitest doesn't flag the hanging task.
    bridgeManager.ensureAgentReady(pubIntent).catch(() => {});

    // Yield once so the pub prep enters its hanging fetch.
    await Promise.resolve();

    await bridgeManager.ensureAgentReady(tunnelIntent);
    expect(state.activeSession?.kind).toBe("tunnel");
    if (state.activeSession?.kind !== "tunnel") throw new Error("unreachable");
    expect(state.activeSession.workspaceCanvasDir).toBe(FAKE_TUNNEL_DIR);
  });
});

function flushTasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeMockChannel(label: string, send?: (msg: string) => void) {
  let onOpen: (() => void) | null = null;
  let onMessage: ((data: string | Buffer) => void) | null = null;
  let opened = true;
  let closed = false;
  return {
    onMessage(cb: (data: string | Buffer) => void) {
      onMessage = cb;
    },
    onOpen(cb: () => void) {
      onOpen = cb;
    },
    onClosed(_cb: () => void) {},
    onError(_cb: (error: string) => void) {},
    sendMessage(msg: string) {
      send?.(msg);
    },
    sendMessageBinary(_data: Buffer) {},
    isOpen() {
      return opened && !closed;
    },
    close() {
      closed = true;
      opened = false;
    },
    getLabel() {
      return label;
    },
    get bufferedAmount() {
      return 0;
    },
    waitForDrain() {
      return Promise.resolve(true);
    },
    emitOpen() {
      onOpen?.();
    },
    emitMessage(data: string | Buffer) {
      onMessage?.(data);
    },
  };
}
