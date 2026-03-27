import { describe, expect, it, vi } from "vitest";
import { BrowserBridge } from "./webrtc-browser";

describe("BrowserBridge ack routing", () => {
  it("sends ack on message channel when it is open", () => {
    const bridge = new BrowserBridge() as unknown as {
      channels: Map<string, { readyState: RTCDataChannelState }>;
      send: (channel: string, message: unknown) => boolean;
      sendAck: (messageId: string, channel: string) => void;
    };
    const send = vi.fn(() => true);
    bridge.channels = new Map([
      ["chat", { readyState: "open" }],
      ["_control", { readyState: "open" }],
    ]);
    bridge.send = send;

    bridge.sendAck("msg-1", "chat");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("chat", expect.any(Object));
  });

  it("falls back to control channel when message channel send fails", () => {
    const bridge = new BrowserBridge() as unknown as {
      channels: Map<string, { readyState: RTCDataChannelState }>;
      send: (channel: string, message: unknown) => boolean;
      sendAck: (messageId: string, channel: string) => void;
    };
    const send = vi.fn((channel: string) => channel === "_control");
    bridge.channels = new Map([
      ["chat", { readyState: "open" }],
      ["_control", { readyState: "open" }],
    ]);
    bridge.send = send;

    bridge.sendAck("msg-2", "chat");

    expect(send).toHaveBeenNthCalledWith(1, "chat", expect.any(Object));
    expect(send).toHaveBeenNthCalledWith(2, "_control", expect.any(Object));
  });

  it("tags streamed binary chunks with the active stream id", () => {
    const bridge = new BrowserBridge() as unknown as {
      activeBinaryStreams: Map<string, { streamId: string; startedAt: number }>;
      pendingBinaryMeta: Map<string, unknown>;
      dedup: { isDuplicate: (key: string) => boolean };
      emitBinaryMessage: (channel: string, payload: ArrayBuffer) => void;
      onMessage: (message: unknown) => void;
      sendAck: (messageId: string, channel: string) => void;
    };
    const onMessage = vi.fn();

    bridge.activeBinaryStreams = new Map([
      ["pub-fs", { streamId: "stream-1", startedAt: Date.now() }],
    ]);
    bridge.pendingBinaryMeta = new Map();
    bridge.dedup = { isDuplicate: () => false };
    bridge.onMessage = onMessage;
    bridge.sendAck = vi.fn();

    bridge.emitBinaryMessage("pub-fs", new Uint8Array([1, 2, 3]).buffer);

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "pub-fs",
        message: expect.objectContaining({
          type: "binary",
          meta: expect.objectContaining({
            size: 3,
            streamId: "stream-1",
          }),
        }),
      }),
    );
  });

  it("uses the relay timeout when TURN servers are configured", async () => {
    const bridge = new BrowserBridge() as unknown as {
      connectionTimeoutMs: number;
      createOffer: (iceConfig: {
        iceServers: Array<{ urls: string | string[] }>;
        transportPolicy?: RTCIceTransportPolicy;
      }) => Promise<string>;
      openChannel: (name: string) => void;
      setupPeerCallbacks: () => void;
      setRuntimeState: (state: unknown) => void;
      armInitialConnectionTimeout: () => void;
    };

    const pc = {
      iceGatheringState: "complete",
      createOffer: vi.fn(async () => ({ sdp: "offer", type: "offer" })),
      setLocalDescription: vi.fn(async () => {}),
      localDescription: { sdp: "offer", type: "offer" },
    };

    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn(() => pc),
    );
    bridge.openChannel = vi.fn();
    bridge.setupPeerCallbacks = vi.fn();
    bridge.setRuntimeState = vi.fn();
    bridge.armInitialConnectionTimeout = vi.fn();

    await bridge.createOffer({
      iceServers: [{ urls: "turn:turn.example.com:3478" }],
      transportPolicy: "relay",
    });

    expect(bridge.connectionTimeoutMs).toBe(45_000);
    vi.unstubAllGlobals();
  });
});
