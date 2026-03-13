import { describe, expect, it } from "vitest";
import {
  CANVAS_FILE_DOWNLOAD_REQUEST_EVENT,
  CANVAS_FILE_RESULT_EVENT,
  makeCanvasFileDownloadRequestMessage,
  makeCanvasFileResultMessage,
  parseCanvasFileDownloadRequestMessage,
  parseCanvasFileDownloadRequestPayload,
  parseCanvasFileResultMessage,
  parseCanvasFileResultPayload,
} from "./canvas-file-protocol-core";

describe("canvas-file-protocol-core", () => {
  it("parses download request payloads", () => {
    expect(
      parseCanvasFileDownloadRequestPayload({
        requestId: "req-1",
        path: "/tmp/demo.wav",
        filename: "voice-note.wav",
      }),
    ).toEqual({
      requestId: "req-1",
      path: "/tmp/demo.wav",
      filename: "voice-note.wav",
    });
  });

  it("parses download request bridge messages", () => {
    expect(
      parseCanvasFileDownloadRequestMessage(
        makeCanvasFileDownloadRequestMessage({
          requestId: "req-2",
          path: "/tmp/demo.txt",
        }),
      ),
    ).toEqual({
      requestId: "req-2",
      path: "/tmp/demo.txt",
      filename: undefined,
    });
  });

  it("parses successful upload results", () => {
    expect(
      parseCanvasFileResultPayload({
        requestId: "req-3",
        op: "upload",
        ok: true,
        file: {
          path: "/tmp/uploaded.webm",
          filename: "uploaded.webm",
          mime: "audio/webm",
          size: 128,
        },
      }),
    ).toEqual({
      requestId: "req-3",
      op: "upload",
      ok: true,
      file: {
        path: "/tmp/uploaded.webm",
        filename: "uploaded.webm",
        mime: "audio/webm",
        size: 128,
      },
      error: undefined,
    });
  });

  it("parses failed results", () => {
    expect(
      parseCanvasFileResultMessage(
        makeCanvasFileResultMessage({
          requestId: "req-4",
          op: "download",
          ok: false,
          error: {
            code: "FILE_NOT_FOUND",
            message: "File does not exist.",
          },
        }),
      ),
    ).toEqual({
      requestId: "req-4",
      op: "download",
      ok: false,
      file: undefined,
      error: {
        code: "FILE_NOT_FOUND",
        message: "File does not exist.",
      },
    });
  });

  it("rejects malformed payloads", () => {
    expect(parseCanvasFileDownloadRequestPayload({ requestId: "req-5" })).toBeNull();
    expect(
      parseCanvasFileResultPayload({
        requestId: "req-6",
        op: "upload",
        ok: true,
      }),
    ).toBeNull();
    expect(
      parseCanvasFileResultPayload({
        requestId: "req-7",
        op: "download",
        ok: false,
      }),
    ).toBeNull();
  });

  it("uses stable bridge event names", () => {
    expect(CANVAS_FILE_DOWNLOAD_REQUEST_EVENT).toBe("canvas.file.download.request");
    expect(CANVAS_FILE_RESULT_EVENT).toBe("canvas.file.result");
  });
});
