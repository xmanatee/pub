import { makeTextMessage } from "@shared/bridge-protocol-core";
import { parseRelayToDaemonMessage } from "@shared/tunnel-protocol-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserTunnelClient } from "./tunnel-client";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
}

describe("createBrowserTunnelClient.sendChannel", () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
    MockWebSocket.instances.length = 0;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it("returns false when the socket is not yet OPEN and does not queue the send", () => {
    const client = createBrowserTunnelClient("ws://relay/ws/token", vi.fn(), undefined, vi.fn());
    const delivered = client.sendChannel("chat", makeTextMessage("hi"));
    expect(delivered).toBe(false);
    expect(MockWebSocket.instances[0]?.sent).toEqual([]);
    client.close();
  });

  it("returns true once the socket is OPEN and encodes a channel frame", () => {
    const connectedChanges: boolean[] = [];
    const client = createBrowserTunnelClient(
      "ws://relay/ws/token",
      vi.fn(),
      undefined,
      (connected) => connectedChanges.push(connected),
    );
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    ws?.open();
    expect(connectedChanges).toContain(true);

    const msg = makeTextMessage("hello");
    const delivered = client.sendChannel("chat", msg);
    expect(delivered).toBe(true);
    expect(ws?.sent).toHaveLength(1);
    const parsed = parseRelayToDaemonMessage(ws?.sent[0] ?? "");
    expect(parsed).toEqual({ type: "channel", channel: "chat", message: msg });
    client.close();
  });

  it("returns false after the socket has been closed", () => {
    const client = createBrowserTunnelClient("ws://relay/ws/token", vi.fn(), undefined, vi.fn());
    const ws = MockWebSocket.instances[0];
    ws?.open();
    client.close();
    const delivered = client.sendChannel("chat", makeTextMessage("hi"));
    expect(delivered).toBe(false);
  });
});
