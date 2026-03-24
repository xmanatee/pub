import type { ReadStream } from "node:fs";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type BridgeMessage,
  CHANNELS,
  encodeMessage,
  STREAM_CHUNK_SIZE,
} from "../../../../shared/bridge-protocol-core";
import {
  encodeTaggedChunk,
  makePubFsDoneMessage,
  makePubFsErrorMessage,
  makePubFsMetadataMessage,
  parsePubFsCancelMessage,
  parsePubFsDeleteMessage,
  parsePubFsReadMessage,
  parsePubFsWriteMessage,
} from "../../../../shared/pub-fs-protocol-core";
import { getMimeType } from "../runtime/file-payload.js";
import type { AdapterDataChannel } from "../transport/webrtc-adapter.js";

interface ActiveRead {
  stream: ReadStream;
}

interface ActiveWrite {
  requestId: string;
  path: string;
  expectedSize: number;
  chunks: Buffer[];
  receivedSize: number;
}

const DRAIN_THRESHOLD = STREAM_CHUNK_SIZE * 5;
const BACKPRESSURE_TIMEOUT_MS = 30_000;

export function createPubFsHandler(params: {
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  openDataChannel: (channel: string) => AdapterDataChannel;
  waitForChannelOpen: (dc: AdapterDataChannel, timeoutMs?: number) => Promise<void>;
}) {
  const activeReads = new Map<string, ActiveRead>();
  const activeWrite: { current: ActiveWrite | null } = { current: null };
  const writeQueue: BridgeMessage[] = [];
  let processingWrites = false;

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
  }

  // --- READ (concurrent, tagged binary chunks) ---

  async function handleRead(msg: BridgeMessage): Promise<void> {
    const request = parsePubFsReadMessage(msg);
    if (!request) return;

    const { requestId, path, rangeStart, rangeEnd } = request;
    const dc = params.openDataChannel(CHANNELS.PUB_FS);
    await params.waitForChannelOpen(dc);

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

    let effectiveStart: number;
    let effectiveEnd: number;

    if (rangeStart !== undefined && rangeEnd !== undefined) {
      effectiveStart = rangeStart;
      effectiveEnd = Math.min(rangeEnd, fileSize - 1);
    } else if (rangeStart !== undefined) {
      effectiveStart = rangeStart;
      effectiveEnd = fileSize - 1;
    } else if (rangeEnd !== undefined) {
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

    sendMessage(
      dc,
      makePubFsMetadataMessage({
        requestId,
        totalSize: fileSize,
        mime: getMimeType(realPath),
        rangeStart: effectiveStart,
        rangeEnd: effectiveEnd,
      }),
    );

    const readStream = createReadStream(realPath, {
      start: effectiveStart,
      end: effectiveEnd,
      highWaterMark: STREAM_CHUNK_SIZE,
    });
    activeReads.set(requestId, { stream: readStream });

    try {
      for await (const chunk of readStream) {
        if (!activeReads.has(requestId)) return;
        const raw = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        const tagged = encodeTaggedChunk(requestId, raw);
        dc.sendMessageBinary(Buffer.from(tagged.buffer, tagged.byteOffset, tagged.byteLength));
        if (dc.bufferedAmount > DRAIN_THRESHOLD) {
          const drained = await dc.waitForDrain(DRAIN_THRESHOLD, BACKPRESSURE_TIMEOUT_MS);
          if (!activeReads.has(requestId)) return;
          if (!drained) {
            activeReads.delete(requestId);
            readStream.destroy();
            sendError(dc, requestId, "READ_ERROR", "Data channel backpressure timeout.");
            return;
          }
        }
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

  // --- WRITE (serialized via writeQueue) ---

  async function handleWrite(msg: BridgeMessage): Promise<void> {
    const request = parsePubFsWriteMessage(msg);
    if (!request) return;

    const { requestId, path: filePath, size } = request;
    const dc = params.openDataChannel(CHANNELS.PUB_FS);
    await params.waitForChannelOpen(dc);

    if (activeWrite.current) {
      sendError(dc, requestId, "WRITE_ERROR", "Another write is already in progress.");
      return;
    }

    if (size === 0) {
      try {
        const resolvedPath = resolve(filePath);
        mkdirSync(dirname(resolvedPath), { recursive: true });
        writeFileSync(resolvedPath, Buffer.alloc(0));
        sendMessage(dc, makePubFsDoneMessage(requestId));
      } catch (error) {
        sendError(
          dc,
          requestId,
          "WRITE_ERROR",
          error instanceof Error ? error.message : "Write failed.",
        );
      }
      return;
    }

    activeWrite.current = {
      requestId,
      path: filePath,
      expectedSize: size,
      chunks: [],
      receivedSize: 0,
    };
  }

  function handleWriteChunk(data: Buffer): void {
    const write = activeWrite.current;
    if (!write) return;
    write.chunks.push(data);
    write.receivedSize += data.length;

    if (write.receivedSize >= write.expectedSize) {
      finishWrite();
    }
  }

  function finishWrite(): void {
    const write = activeWrite.current;
    if (!write) return;
    activeWrite.current = null;

    const dc = params.openDataChannel(CHANNELS.PUB_FS);
    try {
      const resolvedPath = resolve(write.path);
      mkdirSync(dirname(resolvedPath), { recursive: true });
      writeFileSync(resolvedPath, Buffer.concat(write.chunks));
      sendMessage(dc, makePubFsDoneMessage(write.requestId));
    } catch (error) {
      sendError(
        dc,
        write.requestId,
        "WRITE_ERROR",
        error instanceof Error ? error.message : "Write failed.",
      );
    }
  }

  // --- DELETE (serialized with writes) ---

  async function handleDelete(msg: BridgeMessage): Promise<void> {
    const request = parsePubFsDeleteMessage(msg);
    if (!request) return;

    const { requestId, path: filePath } = request;
    const dc = params.openDataChannel(CHANNELS.PUB_FS);
    await params.waitForChannelOpen(dc);

    try {
      const resolvedPath = resolve(filePath);
      if (!existsSync(resolvedPath)) {
        sendError(dc, requestId, "NOT_FOUND", "File does not exist.");
        return;
      }
      unlinkSync(resolvedPath);
      sendMessage(dc, makePubFsDoneMessage(requestId));
    } catch (error) {
      sendError(
        dc,
        requestId,
        "DELETE_ERROR",
        error instanceof Error ? error.message : "Delete failed.",
      );
    }
  }

  // --- Write/delete queue (serialized to prevent interleaving write chunks) ---

  async function processWriteQueue(): Promise<void> {
    if (processingWrites) return;
    processingWrites = true;
    while (writeQueue.length > 0) {
      const next = writeQueue.shift()!;
      if (next.type === "event" && next.data === "pub-fs.write") await handleWrite(next);
      else if (next.type === "event" && next.data === "pub-fs.delete") await handleDelete(next);
    }
    processingWrites = false;
  }

  return {
    onMessage(message: BridgeMessage): void {
      if (message.type === "event") {
        if (message.data === "pub-fs.read") {
          void handleRead(message).catch((error) =>
            params.markError("pub-fs read failed", error),
          );
          return;
        }
        if (message.data === "pub-fs.write" || message.data === "pub-fs.delete") {
          writeQueue.push(message);
          void processWriteQueue().catch((error) =>
            params.markError("pub-fs write queue failed", error),
          );
          return;
        }
        if (message.data === "pub-fs.cancel") {
          const request = parsePubFsCancelMessage(message);
          if (request) cancelRead(request.requestId);
          return;
        }
      }
      if (message.type === "binary" && message.data) {
        handleWriteChunk(Buffer.from(message.data, "base64"));
        return;
      }
    },
    reset(): void {
      writeQueue.length = 0;
      processingWrites = false;
      activeWrite.current = null;
      for (const [, active] of activeReads) {
        active.stream.destroy();
      }
      activeReads.clear();
    },
  };
}
