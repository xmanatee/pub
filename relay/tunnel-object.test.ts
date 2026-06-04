import { describe, expect, it } from "vitest";
import { getSelectedWebSocketSubprotocol, getTunnelProxyPath } from "./src/tunnel-object";

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
