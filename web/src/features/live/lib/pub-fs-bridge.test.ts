/** @vitest-environment jsdom */
import { CHANNELS, generateMessageId } from "@shared/bridge-protocol-core";
import { encodeTaggedChunk, makePubFsMetadataMessage } from "@shared/pub-fs-protocol-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserBridge, ChannelMessage } from "~/features/live/lib/webrtc-browser";
import { PubFsBridge } from "./pub-fs-bridge";

function flushTasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PubFsBridge", () => {
  let bridge: PubFsBridge | null = null;

  afterEach(() => {
    bridge?.destroy();
    bridge = null;
  });

  it("waits for a ready bridge before sending pub-fs requests", async () => {
    let resolveReady!: (bridge: BrowserBridge | null) => void;
    const send = vi.fn<(channel: string, message: unknown) => boolean>(() => true);
    const sendBinary = vi.fn<(channel: string, data: ArrayBuffer) => boolean>(() => true);
    const fakeBridge = { send, sendBinary } as unknown as BrowserBridge;

    bridge = new PubFsBridge(
      { current: fakeBridge },
      () =>
        new Promise((resolve) => {
          resolveReady = resolve;
        }),
    );

    const requestChannel = new MessageChannel();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "pub-fs-request",
          method: "GET",
          requestId: "req-1",
          path: "/tmp/test.txt",
        },
        ports: [requestChannel.port1],
      }),
    );

    expect(send).not.toHaveBeenCalled();

    resolveReady(fakeBridge);
    await flushTasks();

    expect(send).toHaveBeenCalledTimes(1);
    const [sentChannel, message] = send.mock.calls[0] ?? [];
    expect(sentChannel).toBe(CHANNELS.PUB_FS);
    expect(message).toMatchObject({
      type: "event",
      data: "pub-fs.read",
      meta: {
        requestId: "req-1",
        path: "/tmp/test.txt",
      },
    });
  });

  it("reports a connection error when no ready bridge becomes available", async () => {
    bridge = new PubFsBridge({ current: null }, async () => null);

    const requestChannel = new MessageChannel();
    const response = new Promise<unknown>((resolve) => {
      requestChannel.port2.onmessage = (event) => resolve(event.data);
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "pub-fs-request",
          method: "GET",
          requestId: "req-1",
          path: "/tmp/test.txt",
        },
        ports: [requestChannel.port1],
      }),
    );

    await expect(response).resolves.toEqual({
      type: "error",
      code: "NO_CONNECTION",
      message: "No live connection.",
    });
  });

  it("fails waiting requests on destroy without leaking them into a later-ready bridge", async () => {
    let resolveReady!: (bridge: BrowserBridge | null) => void;
    const send = vi.fn<(channel: string, message: unknown) => boolean>(() => true);
    const sendBinary = vi.fn<(channel: string, data: ArrayBuffer) => boolean>(() => true);
    const fakeBridge = { send, sendBinary } as unknown as BrowserBridge;

    bridge = new PubFsBridge(
      { current: fakeBridge },
      () =>
        new Promise((resolve) => {
          resolveReady = resolve;
        }),
    );

    const requestChannel = new MessageChannel();
    const response = new Promise<unknown>((resolve) => {
      requestChannel.port2.onmessage = (event) => resolve(event.data);
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "pub-fs-request",
          method: "GET",
          requestId: "req-1",
          path: "/tmp/test.txt",
        },
        ports: [requestChannel.port1],
      }),
    );

    bridge.destroy();
    resolveReady(fakeBridge);
    await flushTasks();

    await expect(response).resolves.toEqual({
      type: "error",
      code: "BRIDGE_DESTROYED",
      message: "Connection closed.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("routes tagged binary chunks to the correct pending request", async () => {
    const send = vi.fn<(channel: string, message: unknown) => boolean>(() => true);
    const sendBinary = vi.fn<(channel: string, data: ArrayBuffer) => boolean>(() => true);
    const fakeBridge = { send, sendBinary } as unknown as BrowserBridge;

    bridge = new PubFsBridge({ current: fakeBridge }, async () => fakeBridge);

    const channelA = new MessageChannel();
    const channelB = new MessageChannel();
    const messagesA: unknown[] = [];
    const messagesB: unknown[] = [];
    channelA.port2.onmessage = (e) => messagesA.push(e.data);
    channelB.port2.onmessage = (e) => messagesB.push(e.data);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "pub-fs-request", method: "GET", requestId: "req-a", path: "/a.mp4" },
        ports: [channelA.port1],
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "pub-fs-request", method: "GET", requestId: "req-b", path: "/b.jpg" },
        ports: [channelB.port1],
      }),
    );
    await flushTasks();

    // Simulate metadata for both requests
    const metaA = makePubFsMetadataMessage({
      requestId: "req-a",
      totalSize: 100,
      mime: "video/mp4",
      rangeStart: 0,
      rangeEnd: 99,
    });
    const metaB = makePubFsMetadataMessage({
      requestId: "req-b",
      totalSize: 50,
      mime: "image/jpeg",
      rangeStart: 0,
      rangeEnd: 49,
    });
    bridge.handleChannelMessage({ channel: "pub-fs", message: metaA, timestamp: Date.now() });
    bridge.handleChannelMessage({ channel: "pub-fs", message: metaB, timestamp: Date.now() });
    await flushTasks();

    // Simulate interleaved tagged binary chunks
    const chunkA = encodeTaggedChunk("req-a", new Uint8Array([1, 2, 3]));
    const chunkB = encodeTaggedChunk("req-b", new Uint8Array([4, 5, 6]));
    const chunkA2 = encodeTaggedChunk("req-a", new Uint8Array([7, 8, 9]));

    const makeBinaryCm = (data: Uint8Array): ChannelMessage => ({
      channel: "pub-fs",
      message: { id: generateMessageId(), type: "binary", meta: { size: data.byteLength } },
      timestamp: Date.now(),
      binaryData: (data.buffer as ArrayBuffer).slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ),
    });

    bridge.handleChannelMessage(makeBinaryCm(chunkA));
    bridge.handleChannelMessage(makeBinaryCm(chunkB));
    bridge.handleChannelMessage(makeBinaryCm(chunkA2));
    await flushTasks();

    // Verify request A got chunks [1,2,3] and [7,8,9], request B got [4,5,6]
    const dataChunksA = messagesA
      .filter(
        (m): m is { type: string; data: ArrayBuffer } => (m as { type: string }).type === "chunk",
      )
      .map((m) => new Uint8Array(m.data));
    const dataChunksB = messagesB
      .filter(
        (m): m is { type: string; data: ArrayBuffer } => (m as { type: string }).type === "chunk",
      )
      .map((m) => new Uint8Array(m.data));

    expect(dataChunksA).toHaveLength(2);
    expect(dataChunksA[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(dataChunksA[1]).toEqual(new Uint8Array([7, 8, 9]));
    expect(dataChunksB).toHaveLength(1);
    expect(dataChunksB[0]).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("forwards cancel from SW port to CLI via WebRTC", async () => {
    const send = vi.fn<(channel: string, message: unknown) => boolean>(() => true);
    const sendBinary = vi.fn<(channel: string, data: ArrayBuffer) => boolean>(() => true);
    const fakeBridge = { send, sendBinary } as unknown as BrowserBridge;

    bridge = new PubFsBridge({ current: fakeBridge }, async () => fakeBridge);

    const requestChannel = new MessageChannel();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "pub-fs-request",
          method: "GET",
          requestId: "req-cancel-1",
          path: "/tmp/video.mp4",
        },
        ports: [requestChannel.port1],
      }),
    );
    await flushTasks();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[1]).toMatchObject({ data: "pub-fs.read" });

    // Simulate SW sending cancel on the MessagePort
    requestChannel.port2.postMessage({ type: "cancel" });
    await flushTasks();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toBe(CHANNELS.PUB_FS);
    expect(send.mock.calls[1]?.[1]).toMatchObject({
      type: "event",
      data: "pub-fs.cancel",
      meta: { requestId: "req-cancel-1" },
    });
  });

  it("cancel before bridge ready cleans up without forwarding to CLI", async () => {
    let resolveReady!: (bridge: BrowserBridge | null) => void;
    const send = vi.fn<(channel: string, message: unknown) => boolean>(() => true);
    const sendBinary = vi.fn<(channel: string, data: ArrayBuffer) => boolean>(() => true);
    const fakeBridge = { send, sendBinary } as unknown as BrowserBridge;

    bridge = new PubFsBridge(
      { current: fakeBridge },
      () =>
        new Promise((resolve) => {
          resolveReady = resolve;
        }),
    );

    const requestChannel = new MessageChannel();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "pub-fs-request",
          method: "GET",
          requestId: "req-early-cancel",
          path: "/tmp/video.mp4",
        },
        ports: [requestChannel.port1],
      }),
    );

    // Cancel before bridge is ready (request not yet sent to CLI)
    requestChannel.port2.postMessage({ type: "cancel" });
    await flushTasks();

    // No cancel forwarded to CLI because request was never sent
    expect(send).not.toHaveBeenCalled();

    // Even after bridge becomes ready, the cancelled request should not be sent
    resolveReady(fakeBridge);
    await flushTasks();

    expect(send).not.toHaveBeenCalled();
  });

  it("cleans up port listener when request completes with done", async () => {
    const send = vi.fn<(channel: string, message: unknown) => boolean>(() => true);
    const sendBinary = vi.fn<(channel: string, data: ArrayBuffer) => boolean>(() => true);
    const fakeBridge = { send, sendBinary } as unknown as BrowserBridge;

    bridge = new PubFsBridge({ current: fakeBridge }, async () => fakeBridge);

    const requestChannel = new MessageChannel();
    const messages: unknown[] = [];
    requestChannel.port2.onmessage = (e) => messages.push(e.data);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "pub-fs-request",
          method: "GET",
          requestId: "req-done-1",
          path: "/tmp/file.txt",
        },
        ports: [requestChannel.port1],
      }),
    );
    await flushTasks();

    // Complete the request with done
    const doneMsg = {
      id: "d1",
      type: "event" as const,
      data: "pub-fs.done",
      meta: { requestId: "req-done-1" },
    };
    bridge.handleChannelMessage({ channel: "pub-fs", message: doneMsg, timestamp: Date.now() });
    await flushTasks();

    expect(messages).toContainEqual({ type: "done" });

    // Cancel after done should NOT forward to CLI (pending already cleaned up)
    const sendCountBefore = send.mock.calls.length;
    requestChannel.port2.postMessage({ type: "cancel" });
    await flushTasks();

    expect(send.mock.calls.length).toBe(sendCountBefore);
  });
});
