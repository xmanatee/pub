import type {
  CanvasFileDownloadRequestPayload,
  CanvasFileResultPayload,
} from "./canvas-file-protocol-core";
import {
  parseCanvasFileDownloadRequestPayload,
  parseCanvasFileResultPayload,
} from "./canvas-file-protocol-core";
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
  type: "command.invoke";
  payload: CommandInvokePayload;
};

export type CanvasBridgeCancelMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "command.cancel";
  payload: CommandCancelPayload;
};

export type CanvasBridgeFileUploadMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "file.upload";
  payload: {
    bytes: ArrayBuffer;
    mime?: string;
    requestId: string;
  };
};

export type CanvasBridgeFileDownloadMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "file.download";
  payload: CanvasFileDownloadRequestPayload;
};

export type CanvasBridgeConsoleErrorMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "console-error";
  payload: { message: string };
};

export type CanvasBridgePreviewCapturedMessage = {
  source: typeof CANVAS_TO_PARENT_SOURCE;
  type: "preview.captured";
  payload: { html: string };
};

export type CanvasBridgeCommandMessage =
  | CanvasBridgeInvokeMessage
  | CanvasBridgeCancelMessage
  | CanvasBridgeFileUploadMessage
  | CanvasBridgeFileDownloadMessage;

export type CanvasBridgeInboundMessage =
  | CanvasBridgeReadyMessage
  | CanvasBridgeErrorMessage
  | CanvasBridgeConsoleErrorMessage
  | CanvasBridgePreviewCapturedMessage
  | CanvasBridgeInvokeMessage
  | CanvasBridgeCancelMessage
  | CanvasBridgeFileUploadMessage
  | CanvasBridgeFileDownloadMessage;

export type CanvasBridgeResultMessage = {
  source: typeof PARENT_TO_CANVAS_SOURCE;
  type: "command.result";
  payload: CommandResultPayload;
};

export type CanvasBridgeFileResultMessage = {
  source: typeof PARENT_TO_CANVAS_SOURCE;
  type: "file.result";
  payload: CanvasFileResultPayload;
};

export type CanvasBridgeOutboundMessage = CanvasBridgeResultMessage | CanvasBridgeFileResultMessage;

function readArrayBuffer(input: unknown): ArrayBuffer | null {
  return input instanceof ArrayBuffer ? input : null;
}

function parseCanvasFileUploadPayload(
  input: unknown,
): CanvasBridgeFileUploadMessage["payload"] | null {
  const record = readRecord(input);
  if (!record) return null;
  const requestId = readNonEmptyString(record.requestId);
  const bytes = readArrayBuffer(record.bytes);
  if (!requestId || !bytes) return null;
  return {
    requestId,
    bytes,
    mime: readNonEmptyString(record.mime),
  };
}

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

  if (type === "preview.captured") {
    const payload = readRecord(record.payload);
    if (!payload) return null;
    const html = readNonEmptyString(payload.html);
    if (!html) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload: { html } };
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

  if (type === "file.upload") {
    const payload = parseCanvasFileUploadPayload(record.payload);
    if (!payload) return null;
    return { source: CANVAS_TO_PARENT_SOURCE, type, payload };
  }

  if (type === "file.download") {
    const payload = parseCanvasFileDownloadRequestPayload(record.payload);
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
  if (record.type === "command.result") {
    const payload = parseCommandResultPayload(record.payload);
    if (!payload) return null;

    return {
      source: PARENT_TO_CANVAS_SOURCE,
      type: "command.result",
      payload,
    };
  }

  if (record.type === "file.result") {
    const payload = parseCanvasFileResultPayload(record.payload);
    if (!payload) return null;
    return {
      source: PARENT_TO_CANVAS_SOURCE,
      type: "file.result",
      payload,
    };
  }

  return null;
}
