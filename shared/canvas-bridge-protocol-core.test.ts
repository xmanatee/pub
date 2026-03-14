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

  it("parses file upload envelopes", () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "file.upload",
        payload: {
          requestId: "file-1",
          mime: "audio/webm",
          bytes,
        },
      }),
    ).toEqual({
      source: CANVAS_TO_PARENT_SOURCE,
      type: "file.upload",
      payload: {
        requestId: "file-1",
        mime: "audio/webm",
        bytes,
      },
    });
  });

  it("parses file download envelopes", () => {
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "file.download",
        payload: {
          requestId: "file-2",
          path: "/tmp/demo.txt",
          filename: "demo.txt",
        },
      }),
    ).toEqual({
      source: CANVAS_TO_PARENT_SOURCE,
      type: "file.download",
      payload: {
        requestId: "file-2",
        path: "/tmp/demo.txt",
        filename: "demo.txt",
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

  it("parses parent file result envelopes", () => {
    expect(
      parseCanvasBridgeOutboundMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "file.result",
        payload: {
          requestId: "file-3",
          op: "upload",
          ok: true,
          file: {
            path: "/tmp/file.webm",
            filename: "file.webm",
            mime: "audio/webm",
            size: 512,
          },
        },
      }),
    ).toEqual({
      source: PARENT_TO_CANVAS_SOURCE,
      type: "file.result",
      payload: {
        requestId: "file-3",
        op: "upload",
        ok: true,
        file: {
          path: "/tmp/file.webm",
          filename: "file.webm",
          mime: "audio/webm",
          size: 512,
        },
        error: undefined,
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
    expect(
      parseCanvasBridgeInboundMessage({
        source: CANVAS_TO_PARENT_SOURCE,
        type: "file.upload",
        payload: { requestId: "missing-bytes" },
      }),
    ).toBeNull();
    expect(
      parseCanvasBridgeOutboundMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "file.result",
        payload: { requestId: "missing-payload", ok: true },
      }),
    ).toBeNull();
  });
});
