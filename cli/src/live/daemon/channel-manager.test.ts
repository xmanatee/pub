import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import {
  CHANNELS,
  CONTROL_CHANNEL,
  encodeMessage,
  makeAckMessage,
  makeTextMessage,
} from "../../../../shared/bridge-protocol-core";
import { createDaemonChannelManager } from "./channel-manager.js";
import { createDaemonState, setDaemonConnectionState } from "./state.js";

class MockDataChannel {
  sendMessageText = vi.fn<(msg: string) => void>();
  sendMessageBuffer = vi.fn<(data: Buffer) => void>();
  private openHandler: (() => void) | null = null;
  private closedHandler: (() => void) | null = null;
  private errorHandler: ((error: string) => void) | null = null;
  private messageHandler: ((data: string | Buffer) => void) | null = null;
  private opened = true;
  private closed = false;

  constructor(private readonly label: string = CHANNELS.PUB_FS) {}

  onMessage(cb: (data: string | Buffer) => void): void {
    this.messageHandler = cb;
  }

  onOpen(cb: () => void): void {
    this.openHandler = cb;
  }

  onClosed(cb: () => void): void {
    this.closedHandler = cb;
  }

  onError(cb: (error: string) => void): void {
    this.errorHandler = cb;
  }

  sendMessage(msg: string): void {
    this.sendMessageText(msg);
  }

  sendMessageBinary(data: Buffer): void {
    this.sendMessageBuffer(data);
  }

  get bufferedAmount(): number {
    return 0;
  }

  waitForDrain(): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.opened = false;
    this.closedHandler?.();
  }

  getLabel(): string {
    return this.label;
  }

  isOpen(): boolean {
    return this.opened && !this.closed;
  }

  emitOpen(): void {
    this.openHandler?.();
  }

  emitMessage(data: string | Buffer): void {
    this.messageHandler?.(data);
  }

  emitError(error: string): void {
    this.errorHandler?.(error);
  }
}

function flushTasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createDaemonChannelManager pub-fs binary flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards every raw pub-fs binary chunk even when timestamps collide", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123);

    const state = createDaemonState();
    const onPubFsMessage = vi.fn<(msg: BridgeMessage) => Promise<void>>(async () => {});
    const manager = createDaemonChannelManager({
      state,
      debugLog: vi.fn(),
      markError: vi.fn(),
      onCommandMessage: vi.fn(async () => {}),
      onPubFsMessage,
    });

    const dc = new MockDataChannel();
    manager.setupChannel(CHANNELS.PUB_FS, dc as never);
    dc.emitOpen();

    dc.emitMessage(Buffer.from([1, 2, 3]));
    dc.emitMessage(Buffer.from([4, 5, 6]));
    await flushTasks();

    expect(onPubFsMessage).toHaveBeenCalledTimes(2);
    expect(onPubFsMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "binary",
      data: Buffer.from([1, 2, 3]).toString("base64"),
      meta: { size: 3 },
    });
    expect(onPubFsMessage.mock.calls[1]?.[0]).toMatchObject({
      type: "binary",
      data: Buffer.from([4, 5, 6]).toString("base64"),
      meta: { size: 3 },
    });
  });

  it("rejects bridge binary metadata on the pub-fs channel", async () => {
    const markError = vi.fn();
    const onPubFsMessage = vi.fn<(msg: BridgeMessage) => Promise<void>>(async () => {});
    const manager = createDaemonChannelManager({
      state: createDaemonState(),
      debugLog: vi.fn(),
      markError,
      onCommandMessage: vi.fn(async () => {}),
      onPubFsMessage,
    });

    const dc = new MockDataChannel();
    manager.setupChannel(CHANNELS.PUB_FS, dc as never);
    dc.emitOpen();

    dc.emitMessage(JSON.stringify({ id: "meta-1", type: "binary", meta: { size: 2 } }));
    dc.emitMessage(Buffer.from([9, 8]));
    await flushTasks();

    expect(markError).toHaveBeenCalledWith(
      "pub-fs binary chunk must not be preceded by bridge binary metadata",
    );
    expect(onPubFsMessage).toHaveBeenCalledTimes(1);
    expect(onPubFsMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "binary",
      data: Buffer.from([9, 8]).toString("base64"),
      meta: { size: 2 },
    });
  });

  it("preserves ordered pub-fs write delivery between header and binary chunks", async () => {
    const writeStarted = deferredPromise<void>();
    const onPubFsMessage = vi.fn<(msg: BridgeMessage) => Promise<void>>(async (msg) => {
      if (msg.type === "event" && msg.data === "pub-fs.write") {
        await writeStarted.promise;
      }
    });
    const manager = createDaemonChannelManager({
      state: createDaemonState(),
      debugLog: vi.fn(),
      markError: vi.fn(),
      onCommandMessage: vi.fn(async () => {}),
      onPubFsMessage,
    });

    const dc = new MockDataChannel();
    manager.setupChannel(CHANNELS.PUB_FS, dc as never);
    dc.emitOpen();

    dc.emitMessage(
      JSON.stringify({
        id: "write-1",
        type: "event",
        data: "pub-fs.write",
        meta: { requestId: "req-1", path: "/./tmp/file.txt", size: 3 },
      }),
    );
    dc.emitMessage(Buffer.from([1, 2, 3]));
    await flushTasks();

    expect(onPubFsMessage).toHaveBeenCalledTimes(1);
    expect(onPubFsMessage.mock.calls[0]?.[0]).toMatchObject({
      id: "write-1",
      type: "event",
      data: "pub-fs.write",
    });

    writeStarted.resolve();
    await flushTasks();

    expect(onPubFsMessage).toHaveBeenCalledTimes(2);
    expect(onPubFsMessage.mock.calls[1]?.[0]).toMatchObject({
      type: "binary",
      data: Buffer.from([1, 2, 3]).toString("base64"),
      meta: { size: 3 },
    });
  });
});

describe("createDaemonChannelManager fan-out semantics", () => {
  function makeManager(
    overrides: {
      onCommandMessage?: (msg: BridgeMessage) => Promise<void>;
      onChannelClosed?: (name: string) => void;
    } = {},
  ) {
    const state = createDaemonState();
    setDaemonConnectionState(state, "connected");
    const markError = vi.fn();
    const manager = createDaemonChannelManager({
      state,
      debugLog: vi.fn(),
      markError,
      onCommandMessage: overrides.onCommandMessage ?? vi.fn(async () => {}),
      onPubFsMessage: vi.fn(async () => {}),
      onChannelClosed: overrides.onChannelClosed,
    });
    return { state, manager, markError };
  }

  it("tracks multiple concurrent DCs under one name and removes on close", () => {
    const { state, manager } = makeManager();
    const iframeDc = new MockDataChannel("chat");
    const tunnelDc = new MockDataChannel("chat");

    manager.setupChannel("chat", iframeDc as never);
    manager.setupChannel("chat", tunnelDc as never);

    expect(manager.getOpenChannels("chat")).toHaveLength(2);
    expect(manager.hasOpenChannel("chat")).toBe(true);

    iframeDc.close();
    expect(manager.getOpenChannels("chat")).toHaveLength(1);
    expect(manager.hasOpenChannel("chat")).toBe(true);
    expect(state.channels.get("chat")?.size).toBe(1);

    tunnelDc.close();
    expect(manager.getOpenChannels("chat")).toHaveLength(0);
    expect(state.channels.has("chat")).toBe(false);
  });

  it("fans outbound sends to every open DC on a channel", async () => {
    const { manager } = makeManager();
    const iframeDc = new MockDataChannel("chat");
    const tunnelDc = new MockDataChannel("chat");
    manager.setupChannel("chat", iframeDc as never);
    manager.setupChannel("chat", tunnelDc as never);

    const msg = makeTextMessage("hello");
    const p = manager.sendOutboundMessageWithAck("chat", msg, { maxAttempts: 1 });
    // The ack promise would time out; simulate delivery ack via _control.
    manager.settlePendingAck(msg.id, "chat", true);
    await expect(p).resolves.toBe(true);

    expect(iframeDc.sendMessageText).toHaveBeenCalledWith(encodeMessage(msg));
    expect(tunnelDc.sendMessageText).toHaveBeenCalledWith(encodeMessage(msg));
  });

  it("fans queued acks to every open target-channel DC (chat preferred over _control)", () => {
    const { state, manager } = makeManager();
    manager.setupChannel(CONTROL_CHANNEL, new MockDataChannel(CONTROL_CHANNEL) as never);

    const iframeChat = new MockDataChannel("chat");
    const tunnelChat = new MockDataChannel("chat");
    manager.setupChannel("chat", iframeChat as never);
    manager.setupChannel("chat", tunnelChat as never);

    iframeChat.emitMessage(JSON.stringify(makeTextMessage("hi")));

    const ackFor = (dc: MockDataChannel) =>
      dc.sendMessageText.mock.calls
        .map((call) => JSON.parse(call[0] ?? "{}"))
        .find((parsed) => parsed?.type === "event" && parsed?.data === "ack");
    expect(state.pendingOutboundAcks.size).toBe(0);
    expect(ackFor(iframeChat)).toBeDefined();
    expect(ackFor(tunnelChat)).toBeDefined();
  });

  it("fires onChannelClosed every time but the caller can gate on hasOpenChannel", () => {
    const onChannelClosed = vi.fn();
    const { manager } = makeManager({ onChannelClosed });
    const first = new MockDataChannel(CONTROL_CHANNEL);
    const second = new MockDataChannel(CONTROL_CHANNEL);
    manager.setupChannel(CONTROL_CHANNEL, first as never);
    manager.setupChannel(CONTROL_CHANNEL, second as never);

    first.close();
    expect(onChannelClosed).toHaveBeenCalledWith(CONTROL_CHANNEL);
    expect(manager.hasOpenChannel(CONTROL_CHANNEL)).toBe(true);

    second.close();
    expect(manager.hasOpenChannel(CONTROL_CHANNEL)).toBe(false);
  });

  it("resolves waitForDeliveryAck when an ack arrives on any open _control DC", async () => {
    const { manager } = makeManager();
    const peerControl = new MockDataChannel(CONTROL_CHANNEL);
    const tunnelControl = new MockDataChannel(CONTROL_CHANNEL);
    manager.setupChannel(CONTROL_CHANNEL, peerControl as never);
    manager.setupChannel(CONTROL_CHANNEL, tunnelControl as never);

    const waiter = manager.waitForDeliveryAck("msg-2", "chat", 5_000);
    tunnelControl.emitMessage(encodeMessage(makeAckMessage("msg-2", "chat")));
    await expect(waiter).resolves.toBe(true);
  });
});
