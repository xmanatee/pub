import { describe, expect, it } from "vitest";
import { resolveAckChannel as resolveCliAckChannel } from "../../cli/src/lib/ack-routing";
import * as cliBridgeProtocol from "../../cli/src/lib/bridge-protocol";
import { resolveAckChannel as resolveAppAckChannel } from "./ack-routing";
import * as appBridgeProtocol from "./bridge-protocol";

describe("bridge protocol parity (app vs cli)", () => {
  it("keeps core constants aligned", () => {
    expect(appBridgeProtocol.CONTROL_CHANNEL).toBe(cliBridgeProtocol.CONTROL_CHANNEL);
    expect(appBridgeProtocol.CHANNELS).toEqual(cliBridgeProtocol.CHANNELS);
  });

  it("keeps ack message builder output aligned", () => {
    const appAck = appBridgeProtocol.makeAckMessage("msg-1", appBridgeProtocol.CHANNELS.CHAT);
    const cliAck = cliBridgeProtocol.makeAckMessage("msg-1", cliBridgeProtocol.CHANNELS.CHAT);
    expect(appAck.type).toBe("event");
    expect(cliAck.type).toBe("event");
    expect(appAck.data).toBe("ack");
    expect(cliAck.data).toBe("ack");
    expect(appAck.meta?.messageId).toBe("msg-1");
    expect(cliAck.meta?.messageId).toBe("msg-1");
    expect(appAck.meta?.channel).toBe(appBridgeProtocol.CHANNELS.CHAT);
    expect(cliAck.meta?.channel).toBe(cliBridgeProtocol.CHANNELS.CHAT);
    expect(typeof appAck.id).toBe("string");
    expect(typeof cliAck.id).toBe("string");
    expect(typeof appAck.meta?.receivedAt).toBe("number");
    expect(typeof cliAck.meta?.receivedAt).toBe("number");
  });

  it("keeps codec behavior aligned", () => {
    const msg = appBridgeProtocol.makeTextMessage("hello");
    const appEncoded = appBridgeProtocol.encodeMessage(msg);
    const cliEncoded = cliBridgeProtocol.encodeMessage(msg);

    expect(appEncoded).toBe(cliEncoded);
    expect(appBridgeProtocol.decodeMessage(appEncoded)).toEqual(
      cliBridgeProtocol.decodeMessage(cliEncoded),
    );
  });
});

describe("ack routing parity (app vs cli)", () => {
  it("resolves target channel identically", () => {
    const samples = [
      {
        controlChannelOpen: true,
        messageChannelOpen: true,
        messageChannel: appBridgeProtocol.CHANNELS.CHAT,
      },
      {
        controlChannelOpen: false,
        messageChannelOpen: true,
        messageChannel: appBridgeProtocol.CHANNELS.CHAT,
      },
      {
        controlChannelOpen: true,
        messageChannelOpen: false,
        messageChannel: appBridgeProtocol.CHANNELS.CHAT,
      },
      {
        controlChannelOpen: false,
        messageChannelOpen: false,
        messageChannel: appBridgeProtocol.CHANNELS.CHAT,
      },
    ] as const;

    for (const sample of samples) {
      expect(resolveAppAckChannel(sample)).toBe(resolveCliAckChannel(sample));
    }
  });
});
