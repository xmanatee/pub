import type { ReadStream } from "node:fs";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import {
  type BridgeMessage,
  CHANNELS,
  encodeMessage,
  STREAM_CHUNK_SIZE,
} from "../../../../shared/bridge-protocol-core";
import {
  makePubFsDoneMessage,
  makePubFsErrorMessage,
  makePubFsMetadataMessage,
  parsePubFsCancelMessage,
  parsePubFsReadMessage,
} from "../../../../shared/pub-fs-protocol-core";
import { getMimeType } from "../runtime/file-payload.js";
import type { AdapterDataChannel } from "../transport/webrtc-adapter.js";

interface ActiveRead {
  requestId: string;
  stream: ReadStream;
}

export function createPubFsHandler(params: {
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  openDataChannel: (channel: string) => AdapterDataChannel;
  waitForChannelOpen: (dc: AdapterDataChannel, timeoutMs?: number) => Promise<void>;
}) {
  const activeReads = new Map<string, ActiveRead>();
  const readQueue: BridgeMessage[] = [];
  let processing = false;

  function sendMessage(dc: AdapterDataChannel, msg: BridgeMessage): void {
    dc.sendMessage(encodeMessage(msg));
  }

  function sendError(
    dc: AdapterDataChannel,
    requestId: string,
    code: string,
    message: string,
  ): void {
    sendMessage(dc, makePubFsErrorMessage({ requestId, code, message }));
  }

  function cancelRead(requestId: string): void {
    const active = activeReads.get(requestId);
    if (!active) return;
    activeReads.delete(requestId);
    active.stream.destroy();
    params.debugLog(`pub-fs: cancelled read ${requestId}`);
  }

  async function handleReadRequest(msg: BridgeMessage): Promise<void> {
    const request = parsePubFsReadMessage(msg);
    if (!request) return;

    const { requestId, path, rangeStart, rangeEnd } = request;
    params.debugLog(`pub-fs: read ${requestId} path=${path} range=${rangeStart}-${rangeEnd}`);

    const dc = params.openDataChannel(CHANNELS.PUB_FS);
    await params.waitForChannelOpen(dc);

    // Resolve and validate path
    let realPath: string;
    let fileSize: number;
    try {
      if (!existsSync(path)) {
        sendError(dc, requestId, "NOT_FOUND", "File does not exist.");
        return;
      }
      realPath = realpathSync(path);
      const stats = statSync(realPath);
      if (!stats.isFile()) {
        sendError(dc, requestId, "NOT_FOUND", "Path is not a file.");
        return;
      }
      fileSize = stats.size;
    } catch (error) {
      sendError(
        dc,
        requestId,
        "READ_ERROR",
        error instanceof Error ? error.message : "Failed to stat file.",
      );
      return;
    }

    // Compute effective byte range
    let effectiveStart: number;
    let effectiveEnd: number;

    if (rangeStart !== undefined && rangeEnd !== undefined) {
      effectiveStart = rangeStart;
      effectiveEnd = Math.min(rangeEnd, fileSize - 1);
    } else if (rangeStart !== undefined) {
      effectiveStart = rangeStart;
      effectiveEnd = fileSize - 1;
    } else if (rangeEnd !== undefined) {
      // Suffix range: last N bytes
      effectiveStart = Math.max(0, fileSize - rangeEnd);
      effectiveEnd = fileSize - 1;
    } else {
      effectiveStart = 0;
      effectiveEnd = fileSize - 1;
    }

    if (effectiveStart > effectiveEnd || effectiveStart >= fileSize) {
      sendError(dc, requestId, "RANGE_NOT_SATISFIABLE", "Requested range is not satisfiable.");
      return;
    }

    const mime = getMimeType(realPath);

    // Send metadata
    sendMessage(
      dc,
      makePubFsMetadataMessage({
        requestId,
        totalSize: fileSize,
        mime,
        rangeStart: effectiveStart,
        rangeEnd: effectiveEnd,
      }),
    );

    // Stream file chunks
    const readStream = createReadStream(realPath, {
      start: effectiveStart,
      end: effectiveEnd,
      highWaterMark: STREAM_CHUNK_SIZE,
    });

    activeReads.set(requestId, { requestId, stream: readStream });

    try {
      for await (const chunk of readStream) {
        if (!activeReads.has(requestId)) return; // cancelled
        const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        dc.sendMessageBinary(buffer);
      }
      if (activeReads.has(requestId)) {
        activeReads.delete(requestId);
        sendMessage(dc, makePubFsDoneMessage(requestId));
      }
    } catch (error) {
      activeReads.delete(requestId);
      sendError(
        dc,
        requestId,
        "READ_ERROR",
        error instanceof Error ? error.message : "File read failed.",
      );
    }
  }

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    while (readQueue.length > 0) {
      const next = readQueue.shift()!;
      await handleReadRequest(next);
    }
    processing = false;
  }

  function handleCancelRequest(msg: BridgeMessage): void {
    const request = parsePubFsCancelMessage(msg);
    if (!request) return;
    cancelRead(request.requestId);
  }

  return {
    onMessage(message: BridgeMessage): void {
      if (message.type === "event" && message.data === "pub-fs.read") {
        readQueue.push(message);
        void processQueue();
        return;
      }
      if (message.type === "event" && message.data === "pub-fs.cancel") {
        handleCancelRequest(message);
        return;
      }
    },
    reset(): void {
      readQueue.length = 0;
      processing = false;
      for (const [, active] of activeReads) {
        active.stream.destroy();
      }
      activeReads.clear();
    },
  };
}
