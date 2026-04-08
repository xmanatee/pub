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

  it("parses console-error envelopes", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "console-error",
        payload: { message: "Warning: something went wrong" },
      }),
    ).toEqual({
      source: CANVAS_TO_PARENT_SOURCE,
      type: "console-error",
      payload: { message: "Warning: something went wrong" },
    });
  });

  it("rejects console-error with empty message", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "console-error",
        payload: { message: "" },
      }),
    ).toBeNull();
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

  it("rejects removed file message types", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "file.upload",
        payload: { requestId: "file-1", bytes: new ArrayBuffer(3) },
      }),
    ).toBeNull();
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "file.download",
        payload: { requestId: "file-2", path: "/tmp/demo.txt" },
      }),
    ).toBeNull();
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

  it("rejects removed file result type", () => {
    expect(
      parseCanvasBridgeOutboundMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "file.result",
        payload: { requestId: "file-3", op: "upload", ok: true },
      }),
    ).toBeNull();
  });

  it("rejects unknown preview.captured type after removal", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "preview.captured",
        payload: { html: "<html><body>snapshot</body></html>" },
      }),
    ).toBeNull();
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
