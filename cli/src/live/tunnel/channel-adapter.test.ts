import { describe, expect, it, vi } from "vitest";
import type { DaemonToRelayMessage } from "../../../../shared/tunnel-protocol-core";
import { TunnelDataChannel } from "./channel-adapter";

describe("TunnelDataChannel", () => {
  function setup() {
    const send = vi.fn<(msg: DaemonToRelayMessage) => void>();
    const dc = new TunnelDataChannel("pub-fs", send);
    dc.markOpen();
    return { dc, send };
  }

  it("sends text messages as channel protocol messages", () => {
    const { dc, send } = setup();
    dc.sendMessage(JSON.stringify({ id: "1", type: "text", data: "hello" }));
    expect(send).toHaveBeenCalledWith({
      type: "channel",
      channel: "pub-fs",
      message: { id: "1", type: "text", data: "hello" },
    });
  });

  it("sends binary data as channel-binary protocol messages", () => {
    const { dc, send } = setup();
    const data = Buffer.from([1, 2, 3, 4, 5]);
    dc.sendMessageBinary(data);
    expect(send).toHaveBeenCalledWith({
      type: "channel-binary",
      channel: "pub-fs",
      data: data.toString("base64"),
    });
  });

  it("dispatches text messages to onMessage callbacks as encoded strings", () => {
    const { dc } = setup();
    const received: (string | Buffer)[] = [];
    dc.onMessage((data) => received.push(data));
    dc.dispatchMessage({ id: "1", type: "text", data: "hi" });
    expect(received).toHaveLength(1);
    expect(typeof received[0]).toBe("string");
  });

  it("dispatches binary data to onMessage callbacks as Buffers", () => {
    const { dc } = setup();
    const received: (string | Buffer)[] = [];
    dc.onMessage((data) => received.push(data));
    dc.dispatchBinary(Buffer.from([10, 20, 30]));
    expect(received).toHaveLength(1);
    expect(Buffer.isBuffer(received[0])).toBe(true);
    expect(received[0]).toEqual(Buffer.from([10, 20, 30]));
  });
});
