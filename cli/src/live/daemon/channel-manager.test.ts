import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import { CHANNELS } from "../../../../shared/bridge-protocol-core";
import { createDaemonChannelManager } from "./channel-manager.js";
import { createDaemonState } from "./state.js";

class MockDataChannel {
  private openHandler: (() => void) | null = null;
  private closedHandler: (() => void) | null = null;
  private errorHandler: ((error: string) => void) | null = null;
  private messageHandler: ((data: string | Buffer) => void) | null = null;

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

  sendMessage(): void {}

  sendMessageBinary(): void {}

  get bufferedAmount(): number {
    return 0;
  }

  waitForDrain(): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): void {
    this.closedHandler?.();
  }

  getLabel(): string {
    return CHANNELS.PUB_FS;
  }

  isOpen(): boolean {
    return true;
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
