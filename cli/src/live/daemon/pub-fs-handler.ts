import type { ReadStream } from "node:fs";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
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
import type { DataChannelLike } from "../transport/webrtc-adapter.js";
import {
  assertPubFsWriteParent,
  resolveExistingPubFsPath,
  resolvePubFsRequestPath,
} from "./pub-fs-paths.js";

interface ActiveRead {
  stream: ReadStream;
}

interface ActiveWrite {
  requestId: string;
  resolvedPath: string;
  expectedSize: number;
  chunks: Buffer[];
  receivedSize: number;
}

const SEND_HIGH_WATER = 1024 * 1024;
const SEND_LOW_WATER = 256 * 1024;
const BACKPRESSURE_TIMEOUT_MS = 30_000;
const SESSION_ROOT_WAIT_TIMEOUT_MS = 25_000;
const SESSION_ROOT_POLL_MS = 50;

export function createPubFsHandler(params: {
  markError: (message: string, error?: unknown) => void;
  getSessionRootDir: () => string | null;
  ensurePeerChannel: (channel: string) => DataChannelLike;
  waitForChannelOpen: (dc: DataChannelLike, timeoutMs?: number) => Promise<void>;
}) {
  const activeReads = new Map<string, ActiveRead>();
  const activeWrite: { current: ActiveWrite | null } = { current: null };

  function sendMessage(dc: DataChannelLike, msg: BridgeMessage): void {
    dc.sendMessage(encodeMessage(msg));
  }

  function sendError(dc: DataChannelLike, requestId: string, code: string, message: string): void {
    sendMessage(dc, makePubFsErrorMessage({ requestId, code, message }));
  }

  function cancelRead(requestId: string): void {
    const active = activeReads.get(requestId);
    if (!active) return;
    activeReads.delete(requestId);
    active.stream.destroy();
  }

  async function waitForSessionRootDir(): Promise<string | null> {
    const deadline = Date.now() + SESSION_ROOT_WAIT_TIMEOUT_MS;
    let sessionRootDir = params.getSessionRootDir();
    while (!sessionRootDir && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, SESSION_ROOT_POLL_MS));
      sessionRootDir = params.getSessionRootDir();
    }
    return sessionRootDir;
  }

  // --- READ (concurrent, tagged binary chunks) ---

  async function handleRead(msg: BridgeMessage): Promise<void> {
    const request = parsePubFsReadMessage(msg);
    if (!request) return;

    const { requestId, path, rangeStart, rangeEnd } = request;
    const dc = params.ensurePeerChannel(CHANNELS.PUB_FS);
    await params.waitForChannelOpen(dc);
    const sessionRootDir = await waitForSessionRootDir();

    let realPath: string;
    let fileSize: number;
    try {
      const resolvedPath = resolvePubFsRequestPath(path, sessionRootDir);
      if (!existsSync(resolvedPath.path)) {
        sendError(dc, requestId, "NOT_FOUND", "File does not exist.");
        return;
      }
      realPath = resolveExistingPubFsPath(path, sessionRootDir);
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
        if (dc.bufferedAmount > SEND_HIGH_WATER) {
          const drained = await dc.waitForDrain(SEND_LOW_WATER, BACKPRESSURE_TIMEOUT_MS);
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
    const dc = params.ensurePeerChannel(CHANNELS.PUB_FS);
    await params.waitForChannelOpen(dc);
    const sessionRootDir = await waitForSessionRootDir();

    if (activeWrite.current) {
      sendError(dc, requestId, "WRITE_ERROR", "Another write is already in progress.");
      return;
    }

    if (size === 0) {
      try {
        const resolvedPath = resolvePubFsRequestPath(filePath, sessionRootDir);
        mkdirSync(dirname(resolvedPath.path), { recursive: true });
        assertPubFsWriteParent(resolvedPath.path, resolvedPath.scope, sessionRootDir);
        writeFileSync(resolvedPath.path, Buffer.alloc(0));
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

    try {
      const resolvedPath = resolvePubFsRequestPath(filePath, sessionRootDir);
      mkdirSync(dirname(resolvedPath.path), { recursive: true });
      assertPubFsWriteParent(resolvedPath.path, resolvedPath.scope, sessionRootDir);
      activeWrite.current = {
        requestId,
        resolvedPath: resolvedPath.path,
        expectedSize: size,
        chunks: [],
        receivedSize: 0,
      };
    } catch (error) {
      sendError(
        dc,
        requestId,
        "WRITE_ERROR",
        error instanceof Error ? error.message : "Write failed.",
      );
    }
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

    const dc = params.ensurePeerChannel(CHANNELS.PUB_FS);
    try {
      mkdirSync(dirname(write.resolvedPath), { recursive: true });
      writeFileSync(write.resolvedPath, Buffer.concat(write.chunks));
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
    const dc = params.ensurePeerChannel(CHANNELS.PUB_FS);
    await params.waitForChannelOpen(dc);
    const sessionRootDir = await waitForSessionRootDir();

    try {
      const resolvedPath = resolvePubFsRequestPath(filePath, sessionRootDir);
      if (resolvedPath.scope !== "session") {
        sendError(
          dc,
          requestId,
          "DELETE_ERROR",
          "Pub FS deletes must stay inside the active session workspace.",
        );
        return;
      }
      if (!existsSync(resolvedPath.path)) {
        sendError(dc, requestId, "NOT_FOUND", "File does not exist.");
        return;
      }
      unlinkSync(resolveExistingPubFsPath(filePath, sessionRootDir));
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

  return {
    async onMessage(message: BridgeMessage): Promise<void> {
      if (message.type === "event") {
        if (message.data === "pub-fs.read") {
          await handleRead(message);
          return;
        }
        if (message.data === "pub-fs.write" || message.data === "pub-fs.delete") {
          if (message.data === "pub-fs.write") await handleWrite(message);
          else await handleDelete(message);
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
      activeWrite.current = null;
      for (const [, active] of activeReads) {
        active.stream.destroy();
      }
      activeReads.clear();
    },
  };
}
