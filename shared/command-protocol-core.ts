import { type BridgeMessage, makeEventMessage } from "./bridge-protocol-core";

export const COMMAND_PROTOCOL_VERSION = 1;
export const COMMAND_MANIFEST_MAX_FUNCTIONS = 64;

export type CommandReturnType = "void" | "text" | "json";
export type CommandExecutorKind = "exec" | "shell" | "agent";

export interface CommandExecSpec {
  kind: "exec";
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface CommandShellSpec {
  kind: "shell";
  script: string;
  shell?: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface CommandAgentSpec {
  kind: "agent";
  prompt: string;
  provider?: "auto" | "claude-code" | "openclaw";
  timeoutMs?: number;
  output?: "text" | "json";
}

export type CommandExecutorSpec = CommandExecSpec | CommandShellSpec | CommandAgentSpec;

export interface CommandFunctionSpec {
  name: string;
  returns?: CommandReturnType;
  timeoutMs?: number;
  description?: string;
  executor?: CommandExecutorSpec;
}

export interface CommandBindPayload extends Record<string, unknown> {
  v: number;
  manifestId: string;
  functions: CommandFunctionSpec[];
}

export interface CommandBindResultPayload extends Record<string, unknown> {
  v: number;
  manifestId: string;
  accepted: Array<{
    name: string;
    returns: CommandReturnType;
  }>;
  rejected: Array<{
    name: string;
    code: string;
    message: string;
  }>;
}

export interface CommandInvokePayload extends Record<string, unknown> {
  v: number;
  callId: string;
  name: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface CommandErrorPayload extends Record<string, unknown> {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export interface CommandResultPayload extends Record<string, unknown> {
  v: number;
  callId: string;
  ok: boolean;
  value?: unknown;
  error?: CommandErrorPayload;
  durationMs: number;
}

export interface CommandCancelPayload extends Record<string, unknown> {
  v: number;
  callId: string;
  reason?: string;
}

export function makeCommandBindMessage(payload: CommandBindPayload): BridgeMessage {
  return makeEventMessage("command.bind", payload);
}

export function makeCommandBindResultMessage(payload: CommandBindResultPayload): BridgeMessage {
  return makeEventMessage("command.bind.result", payload);
}

export function makeCommandInvokeMessage(payload: CommandInvokePayload): BridgeMessage {
  return makeEventMessage("command.invoke", payload);
}

export function makeCommandResultMessage(payload: CommandResultPayload): BridgeMessage {
  return makeEventMessage("command.result", payload);
}

export function makeCommandCancelMessage(payload: CommandCancelPayload): BridgeMessage {
  return makeEventMessage("command.cancel", payload);
}

function readRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function readString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input : undefined;
}

function readReturnType(input: unknown): CommandReturnType | undefined {
  if (input === "void" || input === "text" || input === "json") return input;
  return undefined;
}

function readFiniteNumber(input: unknown): number | undefined {
  if (typeof input !== "number" || !Number.isFinite(input)) return undefined;
  return input;
}

function readStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input.filter((entry): entry is string => typeof entry === "string");
  return values.length === input.length ? values : undefined;
}

function readStringRecord(input: unknown): Record<string, string> | undefined {
  const record = readRecord(input);
  if (!record) return undefined;
  const values = Object.entries(record).filter((entry): entry is [string, string] => {
    const [_key, value] = entry;
    return typeof value === "string";
  });
  if (values.length !== Object.keys(record).length) return undefined;
  return Object.fromEntries(values);
}

function parseExecutor(input: unknown): CommandExecutorSpec | undefined {
  const record = readRecord(input);
  if (!record) return undefined;
  const kind = readString(record.kind);
  if (!kind) return undefined;

  if (kind === "exec") {
    const command = readString(record.command);
    if (!command) return undefined;
    return {
      kind: "exec",
      command,
      args: readStringArray(record.args),
      cwd: readString(record.cwd),
      timeoutMs: readFiniteNumber(record.timeoutMs),
      env: readStringRecord(record.env),
    };
  }

  if (kind === "shell") {
    const script = readString(record.script);
    if (!script) return undefined;
    return {
      kind: "shell",
      script,
      shell: readString(record.shell),
      cwd: readString(record.cwd),
      timeoutMs: readFiniteNumber(record.timeoutMs),
    };
  }

  if (kind === "agent") {
    const prompt = readString(record.prompt);
    if (!prompt) return undefined;
    const providerRaw = readString(record.provider);
    const provider =
      providerRaw === "claude-code" || providerRaw === "openclaw" || providerRaw === "auto"
        ? providerRaw
        : undefined;
    const outputRaw = readString(record.output);
    const output = outputRaw === "json" || outputRaw === "text" ? outputRaw : undefined;
    return {
      kind: "agent",
      prompt,
      provider,
      timeoutMs: readFiniteNumber(record.timeoutMs),
      output,
    };
  }

  return undefined;
}

function parseFunctionSpec(input: unknown, fallbackName?: string): CommandFunctionSpec | null {
  const record = readRecord(input);
  if (!record) return null;
  const name = readString(record.name) ?? fallbackName;
  if (!name) return null;
  return {
    name,
    returns: readReturnType(record.returns),
    timeoutMs: readFiniteNumber(record.timeoutMs),
    description: readString(record.description),
    executor: parseExecutor(record.executor),
  };
}

function parseFunctionList(input: unknown): CommandFunctionSpec[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => parseFunctionSpec(entry))
      .filter((entry): entry is CommandFunctionSpec => entry !== null)
      .slice(0, COMMAND_MANIFEST_MAX_FUNCTIONS);
  }
  const record = readRecord(input);
  if (!record) return [];

  return Object.entries(record)
    .map(([name, value]) => parseFunctionSpec(value, name))
    .filter((entry): entry is CommandFunctionSpec => entry !== null)
    .slice(0, COMMAND_MANIFEST_MAX_FUNCTIONS);
}

function parseMetaRecord(msg: BridgeMessage): Record<string, unknown> | null {
  return msg.type === "event" && msg.meta ? readRecord(msg.meta) : null;
}

export function parseCommandBindMessage(msg: BridgeMessage): CommandBindPayload | null {
  if (msg.type !== "event" || msg.data !== "command.bind") return null;
  const meta = parseMetaRecord(msg);
  if (!meta) return null;
  const manifestId = readString(meta.manifestId);
  if (!manifestId) return null;
  return {
    v: readFiniteNumber(meta.v) ?? COMMAND_PROTOCOL_VERSION,
    manifestId,
    functions: parseFunctionList(meta.functions),
  };
}

export function parseCommandBindResultMessage(msg: BridgeMessage): CommandBindResultPayload | null {
  if (msg.type !== "event" || msg.data !== "command.bind.result") return null;
  const meta = parseMetaRecord(msg);
  if (!meta) return null;
  const manifestId = readString(meta.manifestId);
  if (!manifestId) return null;

  const acceptedRaw = Array.isArray(meta.accepted) ? meta.accepted : [];
  const rejectedRaw = Array.isArray(meta.rejected) ? meta.rejected : [];
  const accepted = acceptedRaw
    .map((entry) => readRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      name: readString(entry.name) ?? "",
      returns: readReturnType(entry.returns) ?? "void",
    }))
    .filter((entry) => entry.name.length > 0);
  const rejected = rejectedRaw
    .map((entry) => readRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      name: readString(entry.name) ?? "",
      code: readString(entry.code) ?? "REJECTED",
      message: readString(entry.message) ?? "Rejected",
    }))
    .filter((entry) => entry.name.length > 0);

  return {
    v: readFiniteNumber(meta.v) ?? COMMAND_PROTOCOL_VERSION,
    manifestId,
    accepted,
    rejected,
  };
}

export function parseCommandInvokeMessage(msg: BridgeMessage): CommandInvokePayload | null {
  if (msg.type !== "event" || msg.data !== "command.invoke") return null;
  const meta = parseMetaRecord(msg);
  if (!meta) return null;
  const callId = readString(meta.callId);
  const name = readString(meta.name);
  if (!callId || !name) return null;
  return {
    v: readFiniteNumber(meta.v) ?? COMMAND_PROTOCOL_VERSION,
    callId,
    name,
    args: readRecord(meta.args) ?? undefined,
    timeoutMs: readFiniteNumber(meta.timeoutMs),
  };
}

export function parseCommandResultMessage(msg: BridgeMessage): CommandResultPayload | null {
  if (msg.type !== "event" || msg.data !== "command.result") return null;
  const meta = parseMetaRecord(msg);
  if (!meta) return null;
  const callId = readString(meta.callId);
  if (!callId) return null;
  const ok = meta.ok === true;
  const errorRecord = readRecord(meta.error);
  return {
    v: readFiniteNumber(meta.v) ?? COMMAND_PROTOCOL_VERSION,
    callId,
    ok,
    value: meta.value,
    error: errorRecord
      ? {
          code: readString(errorRecord.code) ?? "UNKNOWN",
          message: readString(errorRecord.message) ?? "Unknown error",
          retryable: errorRecord.retryable === true,
          details: errorRecord.details,
        }
      : undefined,
    durationMs: readFiniteNumber(meta.durationMs) ?? 0,
  };
}

export function parseCommandCancelMessage(msg: BridgeMessage): CommandCancelPayload | null {
  if (msg.type !== "event" || msg.data !== "command.cancel") return null;
  const meta = parseMetaRecord(msg);
  if (!meta) return null;
  const callId = readString(meta.callId);
  if (!callId) return null;
  return {
    v: readFiniteNumber(meta.v) ?? COMMAND_PROTOCOL_VERSION,
    callId,
    reason: readString(meta.reason),
  };
}

export function parseCommandFunctionList(input: unknown): CommandFunctionSpec[] {
  return parseFunctionList(input);
}
