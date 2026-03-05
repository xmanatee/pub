import { describe, expect, it } from "vitest";
import { resolveAckChannel as resolveCoreAckChannel } from "../../../../shared/ack-routing-core";
import * as coreBridgeProtocol from "../../../../shared/bridge-protocol-core";
import { resolveAckChannel as resolveAppAckChannel } from "./ack-routing";
import * as appBridgeProtocol from "./bridge-protocol";

describe("bridge protocol parity (app vs shared core)", () => {
  it("keeps core constants aligned", () => {
    expect(appBridgeProtocol.CONTROL_CHANNEL).toBe(coreBridgeProtocol.CONTROL_CHANNEL);
    expect(appBridgeProtocol.CHANNELS).toEqual(coreBridgeProtocol.CHANNELS);
  });

  it("keeps ack message builder output aligned", () => {
    const appAck = appBridgeProtocol.makeAckMessage("msg-1", appBridgeProtocol.CHANNELS.CHAT);
    const coreAck = coreBridgeProtocol.makeAckMessage("msg-1", coreBridgeProtocol.CHANNELS.CHAT);
    expect(appAck.type).toBe("event");
    expect(coreAck.type).toBe("event");
    expect(appAck.data).toBe("ack");
    expect(coreAck.data).toBe("ack");
    expect(appAck.meta?.messageId).toBe("msg-1");
    expect(coreAck.meta?.messageId).toBe("msg-1");
    expect(appAck.meta?.channel).toBe(appBridgeProtocol.CHANNELS.CHAT);
    expect(coreAck.meta?.channel).toBe(coreBridgeProtocol.CHANNELS.CHAT);
    expect(typeof appAck.id).toBe("string");
    expect(typeof coreAck.id).toBe("string");
    expect(typeof appAck.meta?.receivedAt).toBe("number");
    expect(typeof coreAck.meta?.receivedAt).toBe("number");
  });

  it("keeps codec behavior aligned", () => {
    const msg = appBridgeProtocol.makeTextMessage("hello");
    const appEncoded = appBridgeProtocol.encodeMessage(msg);
    const coreEncoded = coreBridgeProtocol.encodeMessage(msg);

    expect(appEncoded).toBe(coreEncoded);
    expect(appBridgeProtocol.decodeMessage(appEncoded)).toEqual(
      coreBridgeProtocol.decodeMessage(coreEncoded),
    );
  });
});

describe("ack routing parity (app vs shared core)", () => {
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
      expect(resolveAppAckChannel(sample)).toBe(resolveCoreAckChannel(sample));
    }
  });
});
