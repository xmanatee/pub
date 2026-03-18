import { type BridgeMessage, makeEventMessage } from "./bridge-protocol-core";
import {
  readFiniteNumber,
  readNonEmptyString,
  readRecord,
  readString,
} from "./protocol-runtime-core";

export const MAX_CANVAS_FILE_BYTES = 10 * 1024 * 1024;
export const CANVAS_FILE_DOWNLOAD_REQUEST_EVENT = "canvas.file.download.request";
export const CANVAS_FILE_RESULT_EVENT = "canvas.file.result";

export type CanvasFileOperation = "upload" | "download";

export type CanvasFileRecord = {
  path?: string;
  filename: string;
  mime: string;
  size: number;
};

export type CanvasFileErrorPayload = {
  code: string;
  message: string;
};

export type CanvasFileDownloadRequestPayload = Record<string, unknown> & {
  requestId: string;
  path: string;
  filename?: string;
};

export type CanvasFileResultPayload = Record<string, unknown> & {
  requestId: string;
  op: CanvasFileOperation;
  ok: boolean;
  file?: CanvasFileRecord;
  error?: CanvasFileErrorPayload;
};

function parseCanvasFileRecord(input: unknown): CanvasFileRecord | null {
  const record = readRecord(input);
  if (!record) return null;
  const filename = readNonEmptyString(record.filename);
  const mime = readNonEmptyString(record.mime);
  const size = readFiniteNumber(record.size);
  if (!filename || !mime || size === undefined || size < 0) return null;
  const path = readString(record.path);
  return {
    path: path && path.trim().length > 0 ? path : undefined,
    filename,
    mime,
    size,
  };
}

function parseCanvasFileError(input: unknown): CanvasFileErrorPayload | null {
  const record = readRecord(input);
  if (!record) return null;
  const code = readNonEmptyString(record.code);
  const message = readNonEmptyString(record.message);
  if (!code || !message) return null;
  return { code, message };
}

export function parseCanvasFileDownloadRequestPayload(
  input: unknown,
): CanvasFileDownloadRequestPayload | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const path = readNonEmptyString(record.path);
  if (!requestId || !path) return null;
  return {
    requestId,
    path,
    filename: readNonEmptyString(record.filename),
  };
}

export function makeCanvasFileDownloadRequestMessage(
  payload: CanvasFileDownloadRequestPayload,
): BridgeMessage {
  return makeEventMessage(CANVAS_FILE_DOWNLOAD_REQUEST_EVENT, payload);
}

export function parseCanvasFileDownloadRequestMessage(
  msg: BridgeMessage,
): CanvasFileDownloadRequestPayload | null {
  if (msg.type !== "event" || msg.data !== CANVAS_FILE_DOWNLOAD_REQUEST_EVENT) return null;
  return parseCanvasFileDownloadRequestPayload(msg.meta);
}

export function parseCanvasFileResultPayload(input: unknown): CanvasFileResultPayload | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const op = record.op === "upload" || record.op === "download" ? record.op : null;
  if (!requestId || !op || (record.ok !== true && record.ok !== false)) return null;
  const ok = record.ok === true;
  const file = record.file === undefined ? undefined : parseCanvasFileRecord(record.file);
  const error = record.error === undefined ? undefined : parseCanvasFileError(record.error);
  if (record.file !== undefined && file === null) return null;
  if (record.error !== undefined && error === null) return null;
  if (ok && !file) return null;
  if (!ok && !error) return null;
  return {
    requestId,
    op,
    ok,
    file: file ?? undefined,
    error: error ?? undefined,
  };
}

export function makeCanvasFileResultMessage(payload: CanvasFileResultPayload): BridgeMessage {
  return makeEventMessage(CANVAS_FILE_RESULT_EVENT, payload);
}

export function parseCanvasFileResultMessage(msg: BridgeMessage): CanvasFileResultPayload | null {
  if (msg.type !== "event" || msg.data !== CANVAS_FILE_RESULT_EVENT) return null;
  return parseCanvasFileResultPayload(msg.meta);
}
