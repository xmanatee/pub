import { describe, expect, it } from "vitest";
import * as cliProtocol from "../../cli/src/lib/bridge-protocol";
import * as webProtocol from "./bridge-protocol";

describe("bridge protocol sync (web <-> cli)", () => {
  it("keeps channel and control constants aligned", () => {
    expect(webProtocol.CONTROL_CHANNEL).toBe(cliProtocol.CONTROL_CHANNEL);
    expect(webProtocol.CHANNELS).toEqual(cliProtocol.CHANNELS);
  });

  it("keeps tunnel limits aligned", () => {
    expect(webProtocol.MAX_TUNNEL_EXPIRY_MS).toBe(cliProtocol.MAX_TUNNEL_EXPIRY_MS);
    expect(webProtocol.DEFAULT_TUNNEL_EXPIRY_MS).toBe(cliProtocol.DEFAULT_TUNNEL_EXPIRY_MS);
    expect(webProtocol.MAX_TUNNELS_PER_USER).toBe(cliProtocol.MAX_TUNNELS_PER_USER);
  });

  it("round-trips payloads across encoders/decoders", () => {
    const msg = webProtocol.makeHtmlMessage("<h1>sync</h1>", "Sync");
    const encodedByWeb = webProtocol.encodeMessage(msg);
    expect(cliProtocol.decodeMessage(encodedByWeb)).toEqual(msg);

    const encodedByCli = cliProtocol.encodeMessage(msg);
    expect(webProtocol.decodeMessage(encodedByCli)).toEqual(msg);
  });

  it("keeps ACK payload helpers aligned", () => {
    const ack = webProtocol.makeAckMessage("msg-sync", webProtocol.CHANNELS.CHAT);
    const encodedByWeb = webProtocol.encodeMessage(ack);
    const decodedByCli = cliProtocol.decodeMessage(encodedByWeb);
    expect(decodedByCli).toEqual(ack);
    expect(cliProtocol.parseAckMessage(decodedByCli as cliProtocol.BridgeMessage)).toEqual({
      messageId: "msg-sync",
      channel: cliProtocol.CHANNELS.CHAT,
      receivedAt: ack.meta?.receivedAt,
    });
  });

  it("keeps tunnel ID format aligned", () => {
    expect(webProtocol.generateTunnelId()).toMatch(/^[a-z0-9]{16}$/);
    expect(cliProtocol.generateTunnelId()).toMatch(/^[a-z0-9]{16}$/);
  });
});
