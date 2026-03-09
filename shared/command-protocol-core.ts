import { type BridgeMessage, makeEventMessage } from "./bridge-protocol-core";
import {
  readFiniteNumber,
  readNonEmptyString,
  readRecord,
  readString,
  readStringArray,
  readStringRecord,
} from "./protocol-runtime-core";

export const COMMAND_PROTOCOL_VERSION = 1;
export const COMMAND_MANIFEST_MAX_FUNCTIONS = 64;
export const COMMAND_MANIFEST_MIME = "application/pubblue-command-manifest+json";

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

export function makeCommandInvokeMessage(payload: CommandInvokePayload): BridgeMessage {
  return makeEventMessage("command.invoke", payload);
}

export function makeCommandResultMessage(payload: CommandResultPayload): BridgeMessage {
  return makeEventMessage("command.result", payload);
}

export function makeCommandCancelMessage(payload: CommandCancelPayload): BridgeMessage {
  return makeEventMessage("command.cancel", payload);
}

function readReturnType(input: unknown): CommandReturnType | undefined {
  if (input === "void" || input === "text" || input === "json") return input;
  return undefined;
}

function parseExecutor(input: unknown): CommandExecutorSpec | undefined {
  const record = readRecord(input);
  if (!record) return undefined;
  const kind = readNonEmptyString(record.kind);
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
  const name = readNonEmptyString(record.name) ?? fallbackName;
  if (!name) return null;
  return {
    name,
    returns: readReturnType(record.returns),
    timeoutMs: readFiniteNumber(record.timeoutMs),
    description: readNonEmptyString(record.description),
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

export function parseCommandInvokePayload(input: unknown): CommandInvokePayload | null {
  const meta = readRecord(input);
  if (!meta) return null;
  const callId = readNonEmptyString(meta.callId);
  const name = readNonEmptyString(meta.name);
  if (!callId || !name) return null;
  return {
    v: readFiniteNumber(meta.v) ?? COMMAND_PROTOCOL_VERSION,
    callId,
    name,
    args: readRecord(meta.args) ?? undefined,
    timeoutMs: readFiniteNumber(meta.timeoutMs),
  };
}

export function parseCommandInvokeMessage(msg: BridgeMessage): CommandInvokePayload | null {
  if (msg.type !== "event" || msg.data !== "command.invoke") return null;
  return parseCommandInvokePayload(parseMetaRecord(msg));
}

export function parseCommandResultPayload(input: unknown): CommandResultPayload | null {
  const meta = readRecord(input);
  if (!meta) return null;
  const callId = readNonEmptyString(meta.callId);
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
          code: readNonEmptyString(errorRecord.code) ?? "UNKNOWN",
          message: readNonEmptyString(errorRecord.message) ?? "Unknown error",
          retryable: errorRecord.retryable === true,
          details: errorRecord.details,
        }
      : undefined,
    durationMs: readFiniteNumber(meta.durationMs) ?? 0,
  };
}

export function parseCommandResultMessage(msg: BridgeMessage): CommandResultPayload | null {
  if (msg.type !== "event" || msg.data !== "command.result") return null;
  return parseCommandResultPayload(parseMetaRecord(msg));
}

export function parseCommandCancelPayload(input: unknown): CommandCancelPayload | null {
  const meta = readRecord(input);
  if (!meta) return null;
  const callId = readNonEmptyString(meta.callId);
  if (!callId) return null;
  return {
    v: readFiniteNumber(meta.v) ?? COMMAND_PROTOCOL_VERSION,
    callId,
    reason: readNonEmptyString(meta.reason),
  };
}

export function parseCommandCancelMessage(msg: BridgeMessage): CommandCancelPayload | null {
  if (msg.type !== "event" || msg.data !== "command.cancel") return null;
  return parseCommandCancelPayload(parseMetaRecord(msg));
}

export function parseCommandFunctionList(input: unknown): CommandFunctionSpec[] {
  return parseFunctionList(input);
}

const MANIFEST_SCRIPT_RE = new RegExp(
  `<script\\s[^>]*type\\s*=\\s*["']${COMMAND_MANIFEST_MIME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>([\\s\\S]*?)<\\/script>`,
  "i",
);

export interface CanvasManifest {
  v: number;
  manifestId: string;
  functions: CommandFunctionSpec[];
}

export function extractManifestFromHtml(html: string): CanvasManifest | null {
  const match = MANIFEST_SCRIPT_RE.exec(html);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  if (raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  const manifestId =
    typeof record.manifestId === "string" && record.manifestId.length > 0
      ? record.manifestId
      : `manifest-${Date.now().toString(36)}`;

  const functions = parseFunctionList(record.functions);

  return {
    v: typeof record.version === "number" ? record.version : 1,
    manifestId,
    functions,
  };
}
