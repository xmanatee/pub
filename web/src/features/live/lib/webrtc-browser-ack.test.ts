import { describe, expect, it, vi } from "vitest";
import { BrowserBridge } from "./webrtc-browser";

describe("BrowserBridge ack routing", () => {
  it("sends ack on message channel when it is open", () => {
    const bridge = new BrowserBridge() as unknown as {
      channels: Map<string, { readyState: RTCDataChannelState }>;
      send: (channel: string, message: unknown) => boolean;
      sendAck: (messageId: string, channel: string) => void;
    };
    const send = vi.fn(() => true);
    bridge.channels = new Map([
      ["chat", { readyState: "open" }],
      ["_control", { readyState: "open" }],
    ]);
    bridge.send = send;

    bridge.sendAck("msg-1", "chat");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("chat", expect.any(Object));
  });

  it("falls back to control channel when message channel send fails", () => {
    const bridge = new BrowserBridge() as unknown as {
      channels: Map<string, { readyState: RTCDataChannelState }>;
      send: (channel: string, message: unknown) => boolean;
      sendAck: (messageId: string, channel: string) => void;
    };
    const send = vi.fn((channel: string) => channel === "_control");
    bridge.channels = new Map([
      ["chat", { readyState: "open" }],
      ["_control", { readyState: "open" }],
    ]);
    bridge.send = send;

    bridge.sendAck("msg-2", "chat");

    expect(send).toHaveBeenNthCalledWith(1, "chat", expect.any(Object));
    expect(send).toHaveBeenNthCalledWith(2, "_control", expect.any(Object));
  });
});
