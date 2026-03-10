import type {
  CommandCancelPayload,
  CommandInvokePayload,
  CommandResultPayload,
} from "./command-protocol-core";
import {
  parseCommandCancelPayload,
  parseCommandInvokePayload,
  parseCommandResultPayload,
} from "./command-protocol-core";
import {
  readFiniteNumber,
  readNonEmptyString,
  readRecord,
  readString,
} from "./protocol-runtime-core";

export const CANVAS_TO_PARENT_SOURCE = "pub-canvas";
export const PARENT_TO_CANVAS_SOURCE = "pub-parent";

export interface CanvasRenderErrorPayload {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

export interface CanvasBridgeErrorMessage {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "error";
  payload: CanvasRenderErrorPayload;
}

export interface CanvasBridgeInvokeMessage {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "command.invoke";
  payload: CommandInvokePayload;
}

export interface CanvasBridgeCancelMessage {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "command.cancel";
  payload: CommandCancelPayload;
}

export type CanvasBridgeCommandMessage = CanvasBridgeInvokeMessage | CanvasBridgeCancelMessage;

export type CanvasBridgeInboundMessage =
  | CanvasBridgeErrorMessage
  | CanvasBridgeInvokeMessage
  | CanvasBridgeCancelMessage;

export interface CanvasBridgeResultMessage {
  source: typeof PARENT_TO_CANVAS_SOURCE;
  type: "command.result";
  payload: CommandResultPayload;
}

export type CanvasBridgeOutboundMessage = CanvasBridgeResultMessage;

function parseCanvasRenderErrorPayload(input: unknown): CanvasRenderErrorPayload | null {
  const record = readRecord(input);
  if (!record) return null;

  const message = readNonEmptyString(record.message);
  if (!message) return null;

  return {
    message,
    filename: readString(record.filename),
    lineno: readFiniteNumber(record.lineno),
    colno: readFiniteNumber(record.colno),
  };
}

export function parseCanvasBridgeInboundMessage(input: unknown): CanvasBridgeInboundMessage | null {
  const record = readRecord(input);
  if (!record || record.source !== CANVAS_TO_PARENT_SOURCE) return null;

  const type = readString(record.type);
  if (!type) return null;

  if (type === "error") {
    const payload = parseCanvasRenderErrorPayload(record.payload);
    if (!payload) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload };
  }

  if (type === "command.invoke") {
    const payload = parseCommandInvokePayload(record.payload);
    if (!payload) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload };
  }

  if (type === "command.cancel") {
    const payload = parseCommandCancelPayload(record.payload);
    if (!payload) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload };
  }

  return null;
}

export function parseCanvasBridgeOutboundMessage(
  input: unknown,
): CanvasBridgeOutboundMessage | null {
  const record = readRecord(input);
  if (!record || record.source !== PARENT_TO_CANVAS_SOURCE) return null;
  if (record.type !== "command.result") return null;

  const payload = parseCommandResultPayload(record.payload);
  if (!payload) return null;

  return {
    source: PARENT_TO_CANVAS_SOURCE,
    type: "command.result",
    payload,
  };
}
