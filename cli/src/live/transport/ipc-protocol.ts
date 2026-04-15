import { type BridgeMessage, parseBridgeMessage } from "../../../../shared/bridge-protocol-core";
import {
  type CommandFunctionSpec,
  parseCommandFunctionSpec,
} from "../../../../shared/command-protocol-core";
import type {
  LiveAgentActivity,
  LiveAgentState,
  LiveConnectionState,
  LiveExecutorState,
} from "../../../../shared/live-runtime-state-core";
import {
  isLiveAgentActivity,
  isLiveAgentState,
  isLiveConnectionState,
  isLiveExecutorState,
} from "../../../../shared/live-runtime-state-core";
import {
  readBoolean,
  readFiniteNumber,
  readRecord,
  readString,
} from "../../../../shared/protocol-runtime-core";
import type { BridgeStatus } from "../bridge/shared.js";

interface IpcErrorResponse {
  ok: false;
  error: string;
}

type IpcSuccessResponse<T extends object = Record<string, never>> = {
  ok: true;
} & T;

type StatusResponse =
  | IpcSuccessResponse<{
      agentActivity: LiveAgentActivity;
      agentState: LiveAgentState;
      connectionState: LiveConnectionState;
      executorState: LiveExecutorState;
      signalingConnected: boolean | null;
      activeSlug: string | null;
      uptime: number;
      channels: string[];
      lastError: string | null;
      bridgeMode: string | null;
      bridge: BridgeStatus | null;
      logPath: string | null;
    }>
  | IpcErrorResponse;

export type WriteRequest = {
  method: "write";
  params: {
    channel?: string;
    msg: BridgeMessage;
    binaryBase64?: string;
  };
};

export type WriteFilesRequest = {
  method: "write-files";
  params: {
    files: Record<string, string>;
  };
};

type WriteResponse =
  | IpcSuccessResponse<{
      delivered?: boolean;
    }>
  | IpcErrorResponse;

type WriteFilesResponse =
  | IpcSuccessResponse<{
      fileCount: number;
    }>
  | IpcErrorResponse;

export type StatusRequest = {
  method: "status";
  params: Record<string, never>;
};

export type ActiveSlugRequest = {
  method: "active-slug";
  params: Record<string, never>;
};

type ActiveSlugResponse =
  | IpcSuccessResponse<{
      slug: string | null;
    }>
  | IpcErrorResponse;

export type CloseRequest = {
  method: "close";
  params: Record<string, never>;
};

type CloseResponse = IpcSuccessResponse | IpcErrorResponse;

export type RunCommandSpecRequest = {
  method: "run-command-spec";
  params: {
    spec: CommandFunctionSpec;
    args: Record<string, unknown>;
    requestedTimeoutMs?: number;
  };
};

type RunCommandSpecResponse =
  | IpcSuccessResponse<{ value: unknown }>
  | IpcErrorResponse;

export type IpcRequest =
  | WriteRequest
  | WriteFilesRequest
  | StatusRequest
  | ActiveSlugRequest
  | CloseRequest
  | RunCommandSpecRequest;

export type IpcResponseMap = {
  "active-slug": ActiveSlugResponse;
  close: CloseResponse;
  status: StatusResponse;
  write: WriteResponse;
  "write-files": WriteFilesResponse;
  "run-command-spec": RunCommandSpecResponse;
};

export type IpcResponseFor<T extends keyof IpcResponseMap> = IpcResponseMap[T];
export type SuccessfulIpcResponseFor<T extends keyof IpcResponseMap> = Extract<
  IpcResponseMap[T],
  { ok: true }
>;

function parseBridgeStatus(input: unknown): BridgeStatus | null {
  if (input === null) return null;
  const record = readRecord(input);
  if (!record) return null;
  const running = readBoolean(record.running);
  const forwardedMessages = readFiniteNumber(record.forwardedMessages);
  if (running === undefined || forwardedMessages === undefined) return null;

  return {
    running,
    sessionId: readString(record.sessionId),
    lastError: readString(record.lastError),
    forwardedMessages,
  };
}

export function parseIpcRequest(input: unknown): IpcRequest | null {
  const record = readRecord(input);
  if (!record) return null;

  const method = readString(record.method);
  const params = readRecord(record.params);
  if (!method || !params) return null;

  if (method === "write") {
    const msg = parseBridgeMessage(params.msg);
    if (!msg) return null;
    const channel = params.channel === undefined ? undefined : readString(params.channel);
    const binaryBase64 =
      params.binaryBase64 === undefined ? undefined : readString(params.binaryBase64);
    if (params.channel !== undefined && channel === undefined) return null;
    if (params.binaryBase64 !== undefined && binaryBase64 === undefined) return null;
    return {
      method,
      params: {
        channel,
        msg,
        binaryBase64,
      },
    };
  }

  if (method === "write-files") {
    const files = readRecord(params.files);
    if (!files) return null;
    const filesMap: Record<string, string> = {};
    for (const [key, value] of Object.entries(files)) {
      const strValue = readString(value);
      if (strValue === undefined) return null;
      filesMap[key] = strValue;
    }
    return { method, params: { files: filesMap } };
  }

  if (method === "status" || method === "active-slug" || method === "close") {
    return { method, params: {} };
  }

  if (method === "run-command-spec") {
    const spec = parseCommandFunctionSpec(params.spec);
    if (!spec) return null;
    const args = readRecord(params.args);
    if (!args) return null;
    const requestedTimeoutMs =
      params.requestedTimeoutMs === undefined
        ? undefined
        : readFiniteNumber(params.requestedTimeoutMs);
    if (params.requestedTimeoutMs !== undefined && requestedTimeoutMs === undefined) return null;
    return { method, params: { spec, args, requestedTimeoutMs } };
  }

  return null;
}

export function parseIpcResponse<T extends IpcRequest["method"]>(
  method: T,
  input: unknown,
): IpcResponseFor<T> | null {
  const record = readRecord(input);
  if (!record) return null;
  const ok = readBoolean(record.ok);
  if (ok === undefined) return null;
  const error = record.error === undefined ? undefined : readString(record.error);
  if (record.error !== undefined && error === undefined) return null;
  if (!ok) {
    return { ok: false, error: error ?? "Unknown daemon error." } as IpcResponseFor<T>;
  }

  if (method === "write") {
    const delivered = record.delivered === undefined ? undefined : readBoolean(record.delivered);
    if (record.delivered !== undefined && delivered === undefined) return null;
    return { ok: true, delivered } as IpcResponseFor<T>;
  }

  if (method === "write-files") {
    const fileCount = readFiniteNumber(record.fileCount);
    if (fileCount === undefined) return null;
    return { ok: true, fileCount } as IpcResponseFor<T>;
  }

  if (method === "status") {
    const agentActivity = readString(record.agentActivity) ?? null;
    const agentState = readString(record.agentState) ?? null;
    const connectionState = readString(record.connectionState) ?? null;
    const executorState = readString(record.executorState) ?? null;
    const signalingConnected =
      record.signalingConnected === null ? null : readBoolean(record.signalingConnected);
    const activeSlug = record.activeSlug === null ? null : readString(record.activeSlug);
    const uptime = readFiniteNumber(record.uptime);
    const lastError = record.lastError === null ? null : readString(record.lastError);
    const bridgeMode = record.bridgeMode === null ? null : readString(record.bridgeMode);
    if (
      !isLiveAgentActivity(agentActivity) ||
      !isLiveAgentState(agentState) ||
      !isLiveConnectionState(connectionState) ||
      !isLiveExecutorState(executorState) ||
      signalingConnected === undefined ||
      activeSlug === undefined ||
      uptime === undefined ||
      !Array.isArray(record.channels) ||
      lastError === undefined ||
      bridgeMode === undefined
    ) {
      return null;
    }
    const channels = record.channels.filter((entry): entry is string => typeof entry === "string");
    if (channels.length !== record.channels.length) return null;
    const bridge = record.bridge == null ? null : parseBridgeStatus(record.bridge);
    if (bridge === null && record.bridge != null) return null;
    const logPath = readString(record.logPath) ?? null;
    return {
      ok: true,
      agentActivity,
      agentState,
      connectionState,
      executorState,
      signalingConnected,
      activeSlug,
      uptime,
      channels,
      lastError,
      bridgeMode,
      bridge,
      logPath,
    } as IpcResponseFor<T>;
  }

  if (method === "active-slug") {
    const slug = record.slug === null ? null : readString(record.slug);
    if (slug === undefined) return null;
    return { ok: true, slug } as IpcResponseFor<T>;
  }

  if (method === "run-command-spec") {
    return { ok: true, value: record.value } as IpcResponseFor<T>;
  }

  return { ok: true } as IpcResponseFor<T>;
}
