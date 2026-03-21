import {
  CANVAS_FILE_RESULT_EVENT,
  type CanvasFileDownloadRequestPayload,
  type CanvasFileOperation,
  MAX_CANVAS_FILE_BYTES,
  makeCanvasFileResultMessage,
  parseCanvasFileDownloadRequestMessage,
} from "../../../../shared/canvas-file-protocol-core";
import {
  CHANNELS,
  STREAM_CHUNK_SIZE,
  encodeMessage,
  makeStreamEnd,
  makeStreamStart,
  type BridgeMessage,
} from "../../../../shared/bridge-protocol-core";
import type { BridgeSettings } from "../../core/config/index.js";
import {
  ensureDirectoryWritable,
  resolveAttachmentFilename,
  sanitizeFilename,
} from "../bridge/attachments.js";
import { getMimeType } from "../runtime/file-payload.js";
import type { AdapterDataChannel } from "../transport/webrtc-adapter.js";
import { existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const CANVAS_FILE_STREAM_ACK_TIMEOUT_MS = 10_000;

interface ActiveUploadStream {
  bytes: number;
  chunks: Buffer[];
  mime: string;
  requestId: string;
}

function canvasFileRoot(attachmentDir: string, slug: string): string {
  return join(attachmentDir, "_canvas", sanitizeFilename(slug));
}

function sanitizeDownloadFilename(input: string | undefined, fallbackPath: string): string {
  const candidate = sanitizeFilename(input || basename(fallbackPath));
  return candidate.length > 0 ? candidate : "download.bin";
}

function decodeBase64Payload(data: string, label: string): Buffer {
  const normalized = data.replace(/\s+/g, "");
  if (normalized.length === 0) {
    throw new Error(`Canvas file payload for ${label} is empty`);
  }
  const payload = Buffer.from(normalized, "base64");
  if (payload.length === 0) {
    throw new Error(`Canvas file payload for ${label} decoded to zero bytes`);
  }
  return payload;
}

function stageCanvasUpload(params: {
  attachmentDir: string;
  bytes: Buffer;
  mime: string;
  requestId: string;
  slug: string;
}) {
  const rootDir = canvasFileRoot(params.attachmentDir, params.slug);
  ensureDirectoryWritable(rootDir);
  const filename = resolveAttachmentFilename({
    channel: CHANNELS.CANVAS_FILE,
    fallbackId: params.requestId,
    mime: params.mime,
  });
  const safeName = `${Date.now()}-${sanitizeFilename(params.requestId)}-${filename}`;
  const targetPath = join(rootDir, safeName);
  const tempPath = `${targetPath}.tmp-${process.pid}`;
  writeFileSync(tempPath, params.bytes, { mode: 0o600 });
  renameSync(tempPath, targetPath);
  return {
    path: targetPath,
    filename: safeName,
    mime: params.mime,
    size: params.bytes.length,
  };
}

function resolveDownloadPath(
  payload: CanvasFileDownloadRequestPayload,
): { path: string; filename: string; size: number; mime: string } {
  const resolvedPath = resolve(payload.path);
  if (!existsSync(resolvedPath)) {
    throw new Error("Requested file does not exist.");
  }

  const realTarget = realpathSync(resolvedPath);
  const stats = statSync(realTarget);
  if (!stats.isFile()) {
    throw new Error("Requested path is not a file.");
  }
  if (stats.size > MAX_CANVAS_FILE_BYTES) {
    throw new Error(
      `Requested file exceeds the ${MAX_CANVAS_FILE_BYTES} byte download limit.`,
    );
  }

  return {
    path: realTarget,
    filename: sanitizeDownloadFilename(payload.filename, realTarget),
    mime: getMimeType(realTarget),
    size: stats.size,
  };
}

export function createCanvasFileTransferHandler(params: {
  state: {
    activeSlug: string | null;
  };
  bridgeSettings: BridgeSettings;
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  sendMessage: (channel: string, msg: BridgeMessage) => Promise<boolean>;
  openDataChannel: (channel: string) => AdapterDataChannel;
  waitForChannelOpen: (channel: AdapterDataChannel, timeoutMs?: number) => Promise<void>;
  waitForDeliveryAck: (messageId: string, channel: string, timeoutMs: number) => Promise<boolean>;
  settlePendingAck: (messageId: string, channel: string, received: boolean) => void;
}) {
  const activeUploads = new Map<string, ActiveUploadStream>();

  async function sendResult(params: {
    requestId: string;
    op: CanvasFileOperation;
    ok: boolean;
    file?: {
      path: string;
      filename: string;
      mime: string;
      size: number;
    };
    error?: {
      code: string;
      message: string;
    };
  }): Promise<void> {
    const delivered = await params_.sendMessage(
      CHANNELS.CANVAS_FILE,
      makeCanvasFileResultMessage({
        requestId: params.requestId,
        op: params.op,
        ok: params.ok,
        file: params.file,
        error: params.error,
      }),
    );
    if (!delivered) {
      params_.markError(
        `failed to deliver ${CANVAS_FILE_RESULT_EVENT} for ${params.op} request ${params.requestId}`,
      );
    }
  }

  async function sendErrorResult(
    requestId: string,
    op: CanvasFileOperation,
    code: string,
    message: string,
  ): Promise<void> {
    await sendResult({
      requestId,
      op,
      ok: false,
      error: { code, message },
    });
  }

  async function sendDownloadStream(params: {
    requestId: string;
    filename: string;
    mime: string;
    bytes: Buffer;
  }): Promise<void> {
    const dc = params_.openDataChannel(CHANNELS.CANVAS_FILE);
    await params_.waitForChannelOpen(dc);

    const startMessage = makeStreamStart(
      {
        filename: params.filename,
        mime: params.mime,
        size: params.bytes.length,
        requestId: params.requestId,
      },
      params.requestId,
    );
    dc.sendMessage(encodeMessage(startMessage));

    for (let offset = 0; offset < params.bytes.length; offset += STREAM_CHUNK_SIZE) {
      const nextChunk = params.bytes.subarray(offset, offset + STREAM_CHUNK_SIZE);
      dc.sendMessageBinary(nextChunk);
    }

    const endMessage = makeStreamEnd(params.requestId);
    const ackPromise = params_.waitForDeliveryAck(
      endMessage.id,
      CHANNELS.CANVAS_FILE,
      CANVAS_FILE_STREAM_ACK_TIMEOUT_MS,
    );

    try {
      dc.sendMessage(encodeMessage(endMessage));
    } catch (error) {
      params_.settlePendingAck(endMessage.id, CHANNELS.CANVAS_FILE, false);
      throw error;
    }

    const acked = await ackPromise;
    if (!acked) {
      throw new Error(`Canvas file stream end ack timed out for ${params.requestId}`);
    }
  }

  async function handleDownloadRequest(message: BridgeMessage): Promise<boolean> {
    const payload = parseCanvasFileDownloadRequestMessage(message);
    if (!payload) return false;

    const slug = params_.state.activeSlug;
    if (!slug) {
      await sendErrorResult(
        payload.requestId,
        "download",
        "NO_ACTIVE_LIVE_SESSION",
        "No active live session is available.",
      );
      return true;
    }

    try {
      const resolvedFile = resolveDownloadPath(payload);
      const bytes = readFileSync(resolvedFile.path);
      await sendDownloadStream({
        requestId: payload.requestId,
        filename: resolvedFile.filename,
        mime: resolvedFile.mime,
        bytes,
      });
      await sendResult({
        requestId: payload.requestId,
        op: "download",
        ok: true,
        file: resolvedFile,
      });
    } catch (error) {
      await sendErrorResult(
        payload.requestId,
        "download",
        "DOWNLOAD_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    return true;
  }

  async function handleUploadStreamEnd(requestId: string): Promise<void> {
    const active = activeUploads.get(requestId);
    activeUploads.delete(requestId);
    if (!active) return;

    const slug = params_.state.activeSlug;
    if (!slug) {
      await sendErrorResult(
        requestId,
        "upload",
        "NO_ACTIVE_LIVE_SESSION",
        "No active live session is available.",
      );
      return;
    }

    if (active.bytes === 0) {
      await sendErrorResult(
        requestId,
        "upload",
        "UPLOAD_EMPTY",
        "Canvas file upload requires non-empty bytes.",
      );
      return;
    }

    try {
      const staged = stageCanvasUpload({
        attachmentDir: params_.bridgeSettings.attachmentDir,
        bytes: Buffer.concat(active.chunks),
        mime: active.mime,
        requestId,
        slug,
      });
      await sendResult({
        requestId,
        op: "upload",
        ok: true,
        file: staged,
      });
    } catch (error) {
      await sendErrorResult(
        requestId,
        "upload",
        "UPLOAD_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function handleUploadMessage(message: BridgeMessage): Promise<boolean> {
    if (message.type === "stream-start") {
      const mime =
        typeof message.meta?.mime === "string" && message.meta.mime.trim().length > 0
          ? message.meta.mime.trim()
          : "application/octet-stream";
      const previous = activeUploads.get(message.id);
      if (previous) {
        await sendErrorResult(
          previous.requestId,
          "upload",
          "UPLOAD_INTERRUPTED",
          "Upload was interrupted by a new stream.",
        );
      }
      activeUploads.set(message.id, {
        requestId: message.id,
        mime,
        bytes: 0,
        chunks: [],
      });
      return true;
    }

    if (message.type === "binary" && typeof message.data === "string") {
      const requestId =
        typeof message.meta?.streamId === "string" && message.meta.streamId.length > 0
          ? message.meta.streamId
          : message.id;
      const active = activeUploads.get(requestId);
      if (!active) return true;
      try {
        const chunk = decodeBase64Payload(message.data, requestId);
        active.bytes += chunk.length;
        if (active.bytes > MAX_CANVAS_FILE_BYTES) {
          activeUploads.delete(requestId);
          await sendErrorResult(
            requestId,
            "upload",
            "UPLOAD_TOO_LARGE",
            `Canvas file upload exceeds the ${MAX_CANVAS_FILE_BYTES} byte limit.`,
          );
          return true;
        }
        active.chunks.push(chunk);
      } catch (error) {
        activeUploads.delete(requestId);
        await sendErrorResult(
          requestId,
          "upload",
          "UPLOAD_INVALID_BINARY",
          error instanceof Error ? error.message : String(error),
        );
      }
      return true;
    }

    if (message.type === "stream-end") {
      const requestId =
        typeof message.meta?.streamId === "string" && message.meta.streamId.length > 0
          ? message.meta.streamId
          : "";
      if (!requestId) return true;
      await handleUploadStreamEnd(requestId);
      return true;
    }

    return false;
  }

  const params_ = params;

  return {
    async onMessage(message: BridgeMessage): Promise<void> {
      if (await handleDownloadRequest(message)) return;
      if (await handleUploadMessage(message)) return;
      params_.debugLog(`ignored canvas-file message type "${message.type}"`);
    },
    reset(): void {
      activeUploads.clear();
    },
  };
}
