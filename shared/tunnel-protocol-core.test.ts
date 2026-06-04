import { describe, expect, it } from "vitest";
import {
  encodeTunnelMessage,
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
});
