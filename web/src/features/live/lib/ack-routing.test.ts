import { describe, expect, it } from "vitest";
import { resolveAckChannel } from "./ack-routing";

describe("resolveAckChannel", () => {
  it("prefers message channel when open", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: true,
        messageChannel: "chat",
        messageChannelOpen: true,
      }),
    ).toBe("chat");
  });

  it("falls back to control channel when message channel is closed", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: true,
        messageChannel: "chat",
        messageChannelOpen: false,
      }),
    ).toBe("_control");
  });
});
