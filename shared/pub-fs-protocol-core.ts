/**
 * Pub FS protocol — shared types for the Service Worker virtual filesystem.
 *
 * Enables generated HTML to access files through HTTP-style `/__pub_files__/` URLs.
 * Session workspace files use `/__pub_files__/_/...`.
 * Absolute host paths use `/__pub_files__/Users/me/...` on POSIX systems.
 * Bytes flow: CLI → WebRTC "pub-fs" channel → main page → MessagePort → SW → Response.
 */

import { type BridgeMessage, makeEventMessage } from "./bridge-protocol-core";
import { readFiniteNumber, readNonEmptyString, readRecord } from "./protocol-runtime-core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PUB_FS_URL_PREFIX = "/__pub_files__/";
export const PUB_FS_READ_EVENT = "pub-fs.read";
export const PUB_FS_WRITE_EVENT = "pub-fs.write";
export const PUB_FS_DELETE_EVENT = "pub-fs.delete";
export const PUB_FS_METADATA_EVENT = "pub-fs.metadata";
export const PUB_FS_ERROR_EVENT = "pub-fs.error";
export const PUB_FS_CANCEL_EVENT = "pub-fs.cancel";
export const PUB_FS_DONE_EVENT = "pub-fs.done";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Browser → CLI: request to read a file (optionally a byte range). */
export type PubFsReadRequest = {
  requestId: string;
  path: string;
  rangeStart?: number;
  rangeEnd?: number;
};

/** CLI → Browser: file metadata sent before streaming bytes. */
export type PubFsMetadataResponse = {
  requestId: string;
  totalSize: number;
  mime: string;
  rangeStart: number;
  rangeEnd: number;
};

/** CLI → Browser: error reading file. */
export type PubFsErrorResponse = {
  requestId: string;
  code: string;
  message: string;
};

/** Browser → CLI: request to write a file. */
export type PubFsWriteRequest = {
  requestId: string;
  path: string;
  size: number;
};

/** Browser → CLI: request to delete a file. */
export type PubFsDeleteRequest = {
  requestId: string;
  path: string;
};

/** Browser → CLI: cancel an in-progress operation. */
export type PubFsCancelRequest = {
  requestId: string;
};

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parsePubFsReadRequest(input: unknown): PubFsReadRequest | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const path = readNonEmptyString(record.path);
  if (!requestId || !path) return null;
  const rangeStart = readFiniteNumber(record.rangeStart);
  const rangeEnd = readFiniteNumber(record.rangeEnd);
  return {
    requestId,
    path,
    rangeStart: rangeStart !== undefined && rangeStart >= 0 ? rangeStart : undefined,
    rangeEnd: rangeEnd !== undefined && rangeEnd >= 0 ? rangeEnd : undefined,
  };
}

export function parsePubFsMetadataResponse(input: unknown): PubFsMetadataResponse | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const totalSize = readFiniteNumber(record.totalSize);
  const mime = readNonEmptyString(record.mime);
  const rangeStart = readFiniteNumber(record.rangeStart);
  const rangeEnd = readFiniteNumber(record.rangeEnd);
  if (!requestId || totalSize === undefined || !mime) return null;
  if (rangeStart === undefined || rangeEnd === undefined) return null;
  return { requestId, totalSize, mime, rangeStart, rangeEnd };
}

export function parsePubFsErrorResponse(input: unknown): PubFsErrorResponse | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const code = readNonEmptyString(record.code);
  const message = readNonEmptyString(record.message);
  if (!requestId || !code || !message) return null;
  return { requestId, code, message };
}

export function parsePubFsWriteRequest(input: unknown): PubFsWriteRequest | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const path = readNonEmptyString(record.path);
  const size = readFiniteNumber(record.size);
  if (!requestId || !path || size === undefined || size < 0) return null;
  return { requestId, path, size };
}

export function parsePubFsDeleteRequest(input: unknown): PubFsDeleteRequest | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const path = readNonEmptyString(record.path);
  if (!requestId || !path) return null;
  return { requestId, path };
}

export function parsePubFsCancelRequest(input: unknown): PubFsCancelRequest | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  if (!requestId) return null;
  return { requestId };
}

// ---------------------------------------------------------------------------
// Bridge message constructors
// ---------------------------------------------------------------------------

export function makePubFsReadMessage(payload: PubFsReadRequest): BridgeMessage {
  return makeEventMessage(PUB_FS_READ_EVENT, payload);
}

export function makePubFsMetadataMessage(payload: PubFsMetadataResponse): BridgeMessage {
  return makeEventMessage(PUB_FS_METADATA_EVENT, payload);
}

export function makePubFsErrorMessage(payload: PubFsErrorResponse): BridgeMessage {
  return makeEventMessage(PUB_FS_ERROR_EVENT, payload);
}

export function makePubFsDoneMessage(requestId: string): BridgeMessage {
  return makeEventMessage(PUB_FS_DONE_EVENT, { requestId });
}

export function makePubFsWriteMessage(payload: PubFsWriteRequest): BridgeMessage {
  return makeEventMessage(PUB_FS_WRITE_EVENT, payload);
}

export function makePubFsDeleteMessage(payload: PubFsDeleteRequest): BridgeMessage {
  return makeEventMessage(PUB_FS_DELETE_EVENT, payload);
}

export function makePubFsCancelMessage(payload: PubFsCancelRequest): BridgeMessage {
  return makeEventMessage(PUB_FS_CANCEL_EVENT, payload);
}

// ---------------------------------------------------------------------------
// Bridge message parsers
// ---------------------------------------------------------------------------

export function parsePubFsReadMessage(msg: BridgeMessage): PubFsReadRequest | null {
  if (msg.type !== "event" || msg.data !== PUB_FS_READ_EVENT) return null;
  return parsePubFsReadRequest(msg.meta);
}

export function parsePubFsMetadataMessage(msg: BridgeMessage): PubFsMetadataResponse | null {
  if (msg.type !== "event" || msg.data !== PUB_FS_METADATA_EVENT) return null;
  return parsePubFsMetadataResponse(msg.meta);
}

export function parsePubFsErrorMessage(msg: BridgeMessage): PubFsErrorResponse | null {
  if (msg.type !== "event" || msg.data !== PUB_FS_ERROR_EVENT) return null;
  return parsePubFsErrorResponse(msg.meta);
}

export function parsePubFsDoneMessage(msg: BridgeMessage): string | null {
  if (msg.type !== "event" || msg.data !== PUB_FS_DONE_EVENT) return null;
  const record = readRecord(msg.meta);
  if (!record) return null;
  return readNonEmptyString(record.requestId) ?? null;
}

export function parsePubFsWriteMessage(msg: BridgeMessage): PubFsWriteRequest | null {
  if (msg.type !== "event" || msg.data !== PUB_FS_WRITE_EVENT) return null;
  return parsePubFsWriteRequest(msg.meta);
}

export function parsePubFsDeleteMessage(msg: BridgeMessage): PubFsDeleteRequest | null {
  if (msg.type !== "event" || msg.data !== PUB_FS_DELETE_EVENT) return null;
  return parsePubFsDeleteRequest(msg.meta);
}

export function parsePubFsCancelMessage(msg: BridgeMessage): PubFsCancelRequest | null {
  if (msg.type !== "event" || msg.data !== PUB_FS_CANCEL_EVENT) return null;
  return parsePubFsCancelRequest(msg.meta);
}

// ---------------------------------------------------------------------------
// Tagged binary chunks — self-identifying binary data for concurrent reads
// Format: [2-byte uint16 BE: requestId length][requestId UTF-8][chunk data]
// ---------------------------------------------------------------------------

export function encodeTaggedChunk(requestId: string, data: Uint8Array): Uint8Array {
  const idBytes = new TextEncoder().encode(requestId);
  if (idBytes.length > 0xffff) throw new RangeError("requestId too long for tagged chunk header");
  const result = new Uint8Array(2 + idBytes.length + data.length);
  result[0] = (idBytes.length >> 8) & 0xff;
  result[1] = idBytes.length & 0xff;
  result.set(idBytes, 2);
  result.set(data, 2 + idBytes.length);
  return result;
}

export function decodeTaggedChunk(
  buffer: ArrayBuffer,
): { requestId: string; data: ArrayBuffer } | null {
  if (buffer.byteLength < 2) return null;
  const view = new DataView(buffer);
  const idLen = view.getUint16(0);
  if (buffer.byteLength < 2 + idLen) return null;
  const requestId = new TextDecoder().decode(new Uint8Array(buffer, 2, idLen));
  if (requestId.length === 0) return null;
  const data = buffer.slice(2 + idLen);
  return { requestId, data };
}
