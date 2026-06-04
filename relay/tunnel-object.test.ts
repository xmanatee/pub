import { describe, expect, it } from "vitest";
import { encodeTunnelMessage, parseRelayToDaemonMessage } from "../shared/tunnel-protocol-core";
import {
  getSelectedWebSocketSubprotocol,
  getTunnelProxyPath,
  TunnelObject,
} from "./src/tunnel-object";

class FakeSocket {
  sent: Array<string | ArrayBuffer> = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  private attachment: unknown = null;

  send(message: string | ArrayBuffer) {
    this.sent.push(message);
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason });
  }

  serializeAttachment(attachment: unknown) {
    this.attachment = attachment;
  }

  deserializeAttachment() {
    return this.attachment;
  }
}

function createState(entries: Array<{ socket: WebSocket; tags: string[] }>): DurableObjectState {
  return {
    getTags(ws: WebSocket) {
      return entries.find((entry) => entry.socket === ws)?.tags ?? [];
    },
    getWebSockets(tag: string) {
      return entries.filter((entry) => entry.tags.includes(tag)).map((entry) => entry.socket);
    },
  } as DurableObjectState;
}

function asWebSocket(socket: FakeSocket): WebSocket {
  return socket as unknown as WebSocket;
}

function createProxyCloseHarness() {
  const daemon = new FakeSocket();
  const proxy = new FakeSocket();
  const state = createState([
    { socket: asWebSocket(daemon), tags: ["daemon"] },
    { socket: asWebSocket(proxy), tags: ["proxy-ws", "proxy-ws:ws-1"] },
  ]);
  return {
    daemon,
    proxy,
    object: new TunnelObject(state, undefined),
  };
}

describe("getTunnelProxyPath", () => {
  it("preserves the query string for proxied websocket requests", () => {
    const url = new URL("https://relay.example/t/session-id/?token=vite-hmr-token");

    expect(getTunnelProxyPath(url)).toBe("/?token=vite-hmr-token");
  });

  it("maps nested tunnel paths without dropping Vite request parameters", () => {
    const url = new URL(
      "https://relay.example/t/session-id/src/App.tsx?import&token=vite-hmr-token",
    );

    expect(getTunnelProxyPath(url)).toBe("/src/App.tsx?import&token=vite-hmr-token");
  });
});

describe("getSelectedWebSocketSubprotocol", () => {
  it("selects the first requested websocket subprotocol", () => {
    const request = new Request("https://relay.example/t/session-id/", {
      headers: { "Sec-WebSocket-Protocol": "vite-hmr, other" },
    });

    expect(getSelectedWebSocketSubprotocol(request)).toBe("vite-hmr");
  });

  it("returns null when no websocket subprotocol is requested", () => {
    expect(
      getSelectedWebSocketSubprotocol(new Request("https://relay.example/t/session-id/")),
    ).toBe(null);
  });
});

describe("TunnelObject proxied websocket close handling", () => {
  it("forwards browser close code and reason to the daemon", async () => {
    const { daemon, proxy, object } = createProxyCloseHarness();

    await object.webSocketClose(asWebSocket(proxy), 1000, "Browser closed", true);

    expect(daemon.sent).toHaveLength(1);
    expect(parseRelayToDaemonMessage(String(daemon.sent[0]))).toEqual({
      type: "ws-close",
      id: "ws-1",
      code: 1000,
      reason: "Browser closed",
    });
  });

  it("does not echo daemon-initiated closes back to the daemon", async () => {
    const { daemon, proxy, object } = createProxyCloseHarness();

    await object.webSocketMessage(
      asWebSocket(daemon),
      encodeTunnelMessage({ type: "ws-close", id: "ws-1", code: 1001, reason: "Tunnel closed" }),
    );
    await object.webSocketClose(asWebSocket(proxy), 1001, "Tunnel closed", true);

    expect(proxy.closeCalls).toEqual([{ code: 1001, reason: "Tunnel closed" }]);
    expect(daemon.sent).toEqual([]);
  });

  it("reports proxied websocket errors once", async () => {
    const { daemon, proxy, object } = createProxyCloseHarness();

    await object.webSocketError(asWebSocket(proxy), new Error("socket failed"));
    await object.webSocketClose(asWebSocket(proxy), 1006, "", false);

    expect(daemon.sent).toHaveLength(1);
    expect(parseRelayToDaemonMessage(String(daemon.sent[0]))).toEqual({
      type: "ws-close",
      id: "ws-1",
      code: 1011,
      reason: "Relay WebSocket error",
    });
  });
});
