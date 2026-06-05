import { describe, expect, it } from "vitest";
import {
  encodeTunnelMessage,
  normalizeWebSocketCloseFrame,
  parseDaemonToRelayMessage,
  parseRelayToDaemonMessage,
} from "./tunnel-protocol-core";

describe("tunnel websocket protocol", () => {
  it("preserves empty websocket frames from relay to daemon", () => {
    expect(
      parseRelayToDaemonMessage(
        encodeTunnelMessage({ type: "ws-data", id: "ws-1", data: "", binary: false }),
      ),
    ).toEqual({ type: "ws-data", id: "ws-1", data: "", binary: false });
  });

  it("preserves empty websocket frames from daemon to relay", () => {
    expect(
      parseDaemonToRelayMessage(
        encodeTunnelMessage({ type: "ws-data", id: "ws-1", data: "", binary: true }),
      ),
    ).toEqual({ type: "ws-data", id: "ws-1", data: "", binary: true });
  });

  it("rewrites reserved abnormal close codes before sending websocket close frames", () => {
    expect(normalizeWebSocketCloseFrame({ code: 1006, reason: "network dropped" })).toEqual({
      code: 4000,
      reason: "network dropped",
    });
  });

  it("preserves valid websocket close codes", () => {
    expect(normalizeWebSocketCloseFrame({ code: 1000, reason: "normal" })).toEqual({
      code: 1000,
      reason: "normal",
    });
    expect(normalizeWebSocketCloseFrame({ code: 4000 })).toEqual({ code: 4000 });
  });

  it("rewrites protocol error codes that browser-style close() APIs reject", () => {
    expect(normalizeWebSocketCloseFrame({ code: 1011, reason: "upstream error" })).toEqual({
      code: 4000,
      reason: "upstream error",
    });
  });
});
