/** @vitest-environment jsdom */
import { CHANNELS } from "@shared/bridge-protocol-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserBridge } from "~/features/live/lib/webrtc-browser";
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
});
