import { describe, expect, it } from "vitest";
import {
  CANVAS_TO_PARENT_SOURCE,
  PARENT_TO_CANVAS_SOURCE,
  parseCanvasBridgeInboundMessage,
  parseCanvasBridgeOutboundMessage,
} from "./canvas-bridge-protocol-core";

describe("canvas-bridge-protocol-core", () => {
  it("parses canvas ready envelopes", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "ready",
        payload: {},
      }),
    ).toEqual({
      source: CANVAS_TO_PARENT_SOURCE,
      type: "ready",
      payload: {},
    });
  });

  it("parses command invoke envelopes", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "command.invoke",
        payload: {
          v: 1,
          callId: "call-1",
          name: "refresh",
          args: { limit: 1 },
          timeoutMs: 5000,
        },
      }),
    ).toEqual({
      source: CANVAS_TO_PARENT_SOURCE,
      type: "command.invoke",
      payload: {
        v: 1,
        callId: "call-1",
        name: "refresh",
        args: { limit: 1 },
        timeoutMs: 5000,
      },
    });
  });

  it("parses render error envelopes", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "error",
        payload: {
          message: "boom",
          filename: "index.js",
          lineno: 7,
          colno: 3,
        },
      }),
    ).toEqual({
      source: CANVAS_TO_PARENT_SOURCE,
      type: "error",
      payload: {
        message: "boom",
        filename: "index.js",
        lineno: 7,
        colno: 3,
      },
    });
  });

  it("parses parent command result envelopes", () => {
    expect(
      parseCanvasBridgeOutboundMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "command.result",
        payload: {
          v: 1,
          callId: "call-2",
          ok: true,
          value: { ready: true },
          durationMs: 15,
        },
      }),
    ).toEqual({
      source: PARENT_TO_CANVAS_SOURCE,
      type: "command.result",
      payload: {
        v: 1,
        callId: "call-2",
        ok: true,
        value: { ready: true },
        durationMs: 15,
      },
    });
  });

  it("rejects malformed envelopes", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "command.invoke",
        payload: { name: "missingCallId" },
      }),
    ).toBeNull();
    expect(
      parseCanvasBridgeOutboundMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "command.result",
        payload: { ok: true },
      }),
    ).toBeNull();
  });
});
