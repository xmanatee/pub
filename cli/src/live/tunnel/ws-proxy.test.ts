import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaemonToRelayMessage, WsOpenMessage } from "../../../../shared/tunnel-protocol-core";
import { createWsProxy } from "./ws-proxy";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  readyState = 1;

  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(_data: unknown): void {}

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
  }
}

function openMessage(): WsOpenMessage {
  return {
    type: "ws-open",
    id: "ws-1",
    path: "/",
    headers: {},
  };
}

describe("createWsProxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes reserved relay close codes before closing the local websocket", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];

    const proxy = createWsProxy(5173, vi.fn<(msg: DaemonToRelayMessage) => void>());
    proxy.handleOpen(openMessage());
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();

    proxy.handleClose({ type: "ws-close", id: "ws-1", code: 1006, reason: "browser dropped" });

    expect(ws.closeCalls).toEqual([{ code: 4000, reason: "browser dropped" }]);
  });

  it("normalizes reserved local close codes before forwarding to the relay", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    const send = vi.fn<(msg: DaemonToRelayMessage) => void>();

    const proxy = createWsProxy(5173, send);
    proxy.handleOpen(openMessage());
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onclose?.({ code: 1006, reason: "local dropped" } as CloseEvent);

    expect(send).toHaveBeenCalledWith({
      type: "ws-close",
      id: "ws-1",
      code: 4000,
      reason: "local dropped",
    });
  });

  it("omits absent close reasons when forwarding to the relay", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    const send = vi.fn<(msg: DaemonToRelayMessage) => void>();

    const proxy = createWsProxy(5173, send);
    proxy.handleOpen(openMessage());
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onclose?.({ code: 1000, reason: "" } as CloseEvent);

    expect(send).toHaveBeenCalledWith({
      type: "ws-close",
      id: "ws-1",
      code: 1000,
    });
  });
});
