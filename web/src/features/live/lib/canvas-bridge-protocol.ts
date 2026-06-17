import type {
  CommandCancelPayload,
  CommandInvokePayload,
  CommandResultPayload,
} from "@shared/command-protocol-core";
import {
  COMMAND_CANCEL_EVENT,
  COMMAND_INVOKE_EVENT,
  COMMAND_RESULT_EVENT,
  parseCommandCancelPayload,
  parseCommandInvokePayload,
  parseCommandResultPayload,
} from "@shared/command-protocol-core";
import {
  readFiniteNumber,
  readNonEmptyString,
  readRecord,
  readString,
} from "@shared/protocol-runtime-core";

export const CANVAS_TO_PARENT_SOURCE = "pub-canvas";
export const PARENT_TO_CANVAS_SOURCE = "pub-parent";

export type CanvasRenderErrorPayload = {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

export type CanvasBridgeErrorMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "error";
  payload: CanvasRenderErrorPayload;
};

export type CanvasBridgeReadyMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "ready";
  payload: Record<string, never>;
};

export type CanvasBridgeInvokeMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: typeof COMMAND_INVOKE_EVENT;
  payload: CommandInvokePayload;
};

export type CanvasBridgeCancelMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: typeof COMMAND_CANCEL_EVENT;
  payload: CommandCancelPayload;
};

export type CanvasBridgeConsoleErrorMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "console-error";
  payload: { message: string };
};

export type CanvasBridgeCommandMessage = CanvasBridgeInvokeMessage | CanvasBridgeCancelMessage;

export type CanvasBridgeInboundMessage =
  | CanvasBridgeReadyMessage
  | CanvasBridgeErrorMessage
  | CanvasBridgeConsoleErrorMessage
  | CanvasBridgeInvokeMessage
  | CanvasBridgeCancelMessage;

export type CanvasBridgeResultMessage = {
  source: typeof PARENT_TO_CANVAS_SOURCE;
  type: typeof COMMAND_RESULT_EVENT;
  payload: CommandResultPayload;
};

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

  if (type === "ready") {
    const payload = readRecord(record.payload);
    if (!payload) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload: {} };
  }

  if (type === "error") {
    const payload = parseCanvasRenderErrorPayload(record.payload);
    if (!payload) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload };
  }

  if (type === "console-error") {
    const payload = readRecord(record.payload);
    if (!payload) return null;
    const message = readNonEmptyString(payload.message);
    if (!message) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload: { message } };
  }

  if (type === COMMAND_INVOKE_EVENT) {
    const payload = parseCommandInvokePayload(record.payload);
    if (!payload) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload };
  }

  if (type === COMMAND_CANCEL_EVENT) {
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
  if (record.type === COMMAND_RESULT_EVENT) {
    const payload = parseCommandResultPayload(record.payload);
    if (!payload) return null;

    return {
      source: PARENT_TO_CANVAS_SOURCE,
      type: COMMAND_RESULT_EVENT,
      payload,
    };
  }

  return null;
}
