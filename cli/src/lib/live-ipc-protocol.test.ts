import { describe, expect, it } from "vitest";
import { parseIpcRequest, parseIpcResponse } from "../live/transport/ipc-protocol.js";

describe("live-ipc-protocol", () => {
  it("parses write requests with bridge messages", () => {
    expect(
      parseIpcRequest({
        method: "write",
        params: {
          channel: "chat",
          msg: { id: "m1", type: "text", data: "hello" },
        },
      }),
    ).toEqual({
      method: "write",
      params: {
        channel: "chat",
        msg: { id: "m1", type: "text", data: "hello", meta: undefined },
        binaryBase64: undefined,
      },
    });
  });

  it("rejects malformed requests", () => {
    expect(parseIpcRequest({ method: "write", params: { msg: { type: "text" } } })).toBeNull();
  });

  it("parses status responses", () => {
    expect(
      parseIpcResponse("status", {
        ok: true,
        connected: true,
        signalingConnected: null,
        activeSlug: "demo",
        uptime: 12,
        channels: ["chat"],
        bufferedMessages: 0,
        lastError: null,
        bridgeMode: "openclaw",
        bridge: { running: true, forwardedMessages: 3 },
      }),
    ).toEqual({
      ok: true,
      connected: true,
      signalingConnected: null,
      activeSlug: "demo",
      uptime: 12,
      channels: ["chat"],
      bufferedMessages: 0,
      lastError: null,
      bridgeMode: "openclaw",
      bridge: { running: true, forwardedMessages: 3 },
      error: undefined,
    });
  });

  it("rejects malformed responses", () => {
    expect(parseIpcResponse("read", { ok: true, messages: [{ channel: "chat" }] })).toBeNull();
  });
});
