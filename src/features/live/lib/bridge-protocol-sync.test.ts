import { describe, expect, it } from "vitest";
import * as coreProtocol from "../../../../shared/bridge-protocol-core";
import * as webProtocol from "./bridge-protocol";

describe("bridge protocol sync (web <-> shared core)", () => {
  it("keeps channel and control constants aligned", () => {
    expect(webProtocol.CONTROL_CHANNEL).toBe(coreProtocol.CONTROL_CHANNEL);
    expect(webProtocol.CHANNELS).toEqual(coreProtocol.CHANNELS);
  });

  it("round-trips payloads across encoders/decoders", () => {
    const msg = webProtocol.makeHtmlMessage("<h1>sync</h1>", "Sync");
    const encodedByWeb = webProtocol.encodeMessage(msg);
    expect(coreProtocol.decodeMessage(encodedByWeb)).toEqual(msg);

    const encodedByCore = coreProtocol.encodeMessage(msg);
    expect(webProtocol.decodeMessage(encodedByCore)).toEqual(msg);
  });

  it("keeps ACK payload helpers aligned", () => {
    const ack = webProtocol.makeAckMessage("msg-sync", webProtocol.CHANNELS.CHAT);
    const encodedByWeb = webProtocol.encodeMessage(ack);
    const decodedByCore = coreProtocol.decodeMessage(encodedByWeb);
    expect(decodedByCore).toEqual(ack);
    expect(coreProtocol.parseAckMessage(decodedByCore as coreProtocol.BridgeMessage)).toEqual({
      messageId: "msg-sync",
      channel: coreProtocol.CHANNELS.CHAT,
      receivedAt: ack.meta?.receivedAt,
    });
  });
});
