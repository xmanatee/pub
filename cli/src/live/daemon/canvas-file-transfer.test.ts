import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeCanvasFileDownloadRequestMessage,
  parseCanvasFileResultMessage,
} from "../../../../shared/canvas-file-protocol-core";
import {
  CHANNELS,
  type BridgeMessage,
  makeStreamEnd,
  makeStreamStart,
} from "../../../../shared/bridge-protocol-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvasFileTransferHandler } from "./canvas-file-transfer.js";
import type { AdapterDataChannel } from "../transport/webrtc-adapter.js";

function createHandlerHarness() {
  const attachmentDir = mkdtempSync(join(tmpdir(), "pub-canvas-files-"));
  const sendMessage = vi.fn(async (_channel: string, _message: unknown) => true);
  const dc = {
    close: vi.fn(),
    getLabel: vi.fn(() => CHANNELS.CANVAS_FILE),
    isOpen: vi.fn(() => true),
    onClosed: vi.fn(),
    onError: vi.fn(),
    onMessage: vi.fn(),
    onOpen: vi.fn(),
    sendMessage: vi.fn(),
    sendMessageBinary: vi.fn(),
  } as unknown as AdapterDataChannel;

  const handler = createCanvasFileTransferHandler({
    state: { activeSlug: "demo" },
    bridgeSettings: {
      attachmentDir,
    } as never,
    debugLog: vi.fn(),
    markError: vi.fn(),
    sendMessage,
    openDataChannel: vi.fn(() => dc),
    waitForChannelOpen: vi.fn(async () => {}),
    waitForDeliveryAck: vi.fn(async () => true),
    settlePendingAck: vi.fn(),
  });

  return {
    attachmentDir,
    dc,
    handler,
    sendMessage,
  };
}

function readSentResult(sendMessage: ReturnType<typeof vi.fn>) {
  return parseCanvasFileResultMessage(sendMessage.mock.calls[0][1] as BridgeMessage);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createCanvasFileTransferHandler", () => {
  it("stages uploaded bytes inside managed canvas storage and emits an upload result", async () => {
    const harness = createHandlerHarness();

    await harness.handler.onMessage(
      makeStreamStart(
        {
          mime: "audio/webm",
          size: 3,
        },
        "upload-1",
      ),
    );
    await harness.handler.onMessage({
      id: "bin-1",
      type: "binary",
      data: Buffer.from([1, 2, 3]).toString("base64"),
      meta: { streamId: "upload-1", size: 3 },
    });
    await harness.handler.onMessage(makeStreamEnd("upload-1"));

    const result = readSentResult(harness.sendMessage);
    expect(result).toMatchObject({
      requestId: "upload-1",
      op: "upload",
      ok: true,
      file: {
        mime: "audio/webm",
        size: 3,
      },
    });
    expect(result?.file?.path).toContain("/_canvas/demo/");
    expect(readFileSync(result?.file?.path ?? "")).toEqual(Buffer.from([1, 2, 3]));

    rmSync(harness.attachmentDir, { force: true, recursive: true });
  });

  it("streams managed files back to the browser for download", async () => {
    const harness = createHandlerHarness();
    const managedDir = join(harness.attachmentDir, "_canvas", "demo");
    const managedFile = join(managedDir, "report.txt");

    mkdirSync(managedDir, { recursive: true });
    writeFileSync(managedFile, "hello");

    await harness.handler.onMessage(
      makeCanvasFileDownloadRequestMessage({
        requestId: "download-1",
        path: managedFile,
        filename: "report.txt",
      }),
    );

    expect(harness.dc.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"stream-start"'),
    );
    expect(harness.dc.sendMessageBinary).toHaveBeenCalledWith(Buffer.from("hello"));

    const result = readSentResult(harness.sendMessage);
    expect(result).toMatchObject({
      requestId: "download-1",
      op: "download",
      ok: true,
      file: {
        path: expect.stringContaining("/_canvas/demo/report.txt"),
        filename: "report.txt",
        mime: expect.stringContaining("text/plain"),
        size: 5,
      },
    });

    rmSync(harness.attachmentDir, { force: true, recursive: true });
  });

  it("rejects downloads outside Pub-managed canvas storage", async () => {
    const harness = createHandlerHarness();
    const outsideFile = join(harness.attachmentDir, "..", "outside.txt");

    writeFileSync(outsideFile, "blocked");

    await harness.handler.onMessage(
      makeCanvasFileDownloadRequestMessage({
        requestId: "download-2",
        path: outsideFile,
      }),
    );

    const result = readSentResult(harness.sendMessage);
    expect(result).toMatchObject({
      requestId: "download-2",
      op: "download",
      ok: false,
      error: {
        code: "DOWNLOAD_FAILED",
      },
    });

    rmSync(harness.attachmentDir, { force: true, recursive: true });
  });
});
