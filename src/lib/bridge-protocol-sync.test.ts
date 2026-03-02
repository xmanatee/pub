import { describe, expect, it } from "vitest";
import * as cliProtocol from "../../cli/src/lib/bridge-protocol";
import * as webProtocol from "./bridge-protocol";

describe("bridge protocol sync (web <-> cli)", () => {
  it("keeps channel and control constants aligned", () => {
    expect(webProtocol.CONTROL_CHANNEL).toBe(cliProtocol.CONTROL_CHANNEL);
    expect(webProtocol.CHANNELS).toEqual(cliProtocol.CHANNELS);
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
});
