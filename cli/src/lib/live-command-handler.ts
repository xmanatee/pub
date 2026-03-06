import { spawn } from "node:child_process";
import type { BridgeMessage } from "../../../shared/bridge-protocol-core";
import {
  COMMAND_PROTOCOL_VERSION,
  type CommandAgentSpec,
  type CommandBindPayload,
  type CommandBindResultPayload,
  type CommandErrorPayload,
  type CommandFunctionSpec,
  type CommandResultPayload,
  type CommandReturnType,
  makeCommandBindResultMessage,
  makeCommandResultMessage,
  parseCommandBindMessage,
  parseCommandCancelMessage,
  parseCommandInvokeMessage,
} from "../../../shared/command-protocol-core";
import { buildClaudeArgs, resolveClaudeCodePath } from "./live-bridge-claude-code.js";
import { resolveOpenClawRuntime } from "./live-bridge-openclaw.js";
import type { BridgeMode } from "./live-daemon-shared.js";

const DEFAULT_RECENT_RESULT_TTL_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_CONCURRENT = 6;

interface CommandHandlerParams {
  bridgeMode?: BridgeMode;
  markError: (message: string, error?: unknown) => void;
  sendCommandMessage: (msg: BridgeMessage) => Promise<boolean>;
}

interface RunningCommand {
  abort: AbortController;
  cancelled: boolean;
  startedAt: number;
}

interface RecentCommandResult {
  expiresAt: number;
  payload: CommandResultPayload;
}

interface CommandRuntimeConfig {
  defaultTimeoutMs: number;
  maxConcurrent: number;
  maxOutputBytes: number;
}

function readPositiveNumberEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readRuntimeConfig(): CommandRuntimeConfig {
  return {
    defaultTimeoutMs: readPositiveNumberEnv(
      "PUBBLUE_COMMAND_DEFAULT_TIMEOUT_MS",
      DEFAULT_COMMAND_TIMEOUT_MS,
    ),
    maxOutputBytes: readPositiveNumberEnv(
      "PUBBLUE_COMMAND_MAX_OUTPUT_BYTES",
      DEFAULT_MAX_OUTPUT_BYTES,
    ),
    maxConcurrent: readPositiveNumberEnv("PUBBLUE_COMMAND_MAX_CONCURRENT", DEFAULT_MAX_CONCURRENT),
  };
}

function readArgPath(args: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let value: unknown = args;
  for (const part of parts) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function interpolateTemplate(input: string, args: Record<string, unknown>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, path: string) => {
    const value = readArgPath(args, path);
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  });
}

function buildCommandError(code: string, message: string, retryable = false): CommandErrorPayload {
  return { code, message, retryable };
}

function toCommandReturnValue(output: string, returnType: CommandReturnType): unknown {
  if (returnType === "void") return null;
  if (returnType === "json") {
    const trimmed = output.trim();
    if (trimmed.length === 0) return {};
    return JSON.parse(trimmed) as unknown;
  }
  return output;
}

async function executeProcessCommand(params: {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
  signal: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: { ...process.env, ...(params.env ?? {}) },
      signal: params.signal,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`Command timed out after ${params.timeoutMs}ms`)));
    }, params.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdout += chunk.toString("utf-8");
      if (stdout.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stdout exceeded ${params.maxOutputBytes} bytes`)));
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderr += chunk.toString("utf-8");
      if (stderr.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stderr exceeded ${params.maxOutputBytes} bytes`)));
      }
    });

    child.on("error", (error) => {
      finish(() => reject(error));
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish(() => resolve({ stdout, stderr }));
        return;
      }
      const detail = stderr.trim().length > 0 ? stderr.trim() : `exit code ${code}`;
      finish(() => reject(new Error(detail)));
    });
  });
}

async function executeShellCommand(params: {
  script: string;
  shell?: string;
  cwd?: string;
  timeoutMs: number;
  maxOutputBytes: number;
  signal: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  const shell = params.shell?.trim() || "/bin/sh";
  return await executeProcessCommand({
    command: shell,
    args: ["-lc", params.script],
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
    maxOutputBytes: params.maxOutputBytes,
    signal: params.signal,
  });
}

function readClaudeAssistantOutput(line: string): string {
  if (!line.trim().startsWith("{")) return "";
  try {
    const event = JSON.parse(line) as {
      delta?: { text?: unknown };
      message?: { content?: unknown; role?: unknown };
      text?: unknown;
      type?: unknown;
    };
    if (typeof event.text === "string") return event.text;
    if (event.delta && typeof event.delta.text === "string") return event.delta.text;
    if (
      event.message &&
      event.message.role === "assistant" &&
      typeof event.message.content === "string"
    ) {
      return event.message.content;
    }
    return "";
  } catch {
    return "";
  }
}

async function executeClaudeAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
}): Promise<unknown> {
  const claudePath = resolveClaudeCodePath(process.env);
  const args = buildClaudeArgs(params.prompt, null, null, process.env);
  if (!args.includes("--max-turns")) {
    args.push("--max-turns", "4");
  }
  const cwd = process.env.CLAUDE_CODE_CWD?.trim() || process.env.PUBBLUE_PROJECT_ROOT || undefined;

  const outputText = await new Promise<string>((resolve, reject) => {
    const child = spawn(claudePath, args, {
      cwd,
      env: { ...process.env },
      signal: params.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`Agent command timed out after ${params.timeoutMs}ms`)));
    }, params.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
      if (stdout.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stdout exceeded ${params.maxOutputBytes} bytes`)));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stderr exceeded ${params.maxOutputBytes} bytes`)));
      }
    });
    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = stderr.trim().length > 0 ? stderr.trim() : `exit code ${code}`;
        finish(() => reject(new Error(detail)));
        return;
      }
      const lines = stdout.split(/\r?\n/);
      const chunks = lines.map(readClaudeAssistantOutput).filter((entry) => entry.length > 0);
      const joined = chunks.join("").trim();
      finish(() => resolve(joined.length > 0 ? joined : stdout.trim()));
    });
  });

  if (params.output === "json") {
    const trimmed = outputText.trim();
    if (trimmed.length === 0) return {};
    return JSON.parse(trimmed) as unknown;
  }
  return outputText;
}

async function executeOpenClawAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
}): Promise<unknown> {
  const runtime = resolveOpenClawRuntime(process.env);
  const invocationArgs = [
    "agent",
    "--local",
    "--session-id",
    runtime.sessionId,
    "-m",
    params.prompt,
  ];
  const command = runtime.openclawPath.endsWith(".js") ? process.execPath : runtime.openclawPath;
  const args = runtime.openclawPath.endsWith(".js")
    ? [runtime.openclawPath, ...invocationArgs]
    : invocationArgs;
  const result = await executeProcessCommand({
    command,
    args,
    cwd: process.env.PUBBLUE_PROJECT_ROOT || process.cwd(),
    timeoutMs: params.timeoutMs,
    maxOutputBytes: params.maxOutputBytes,
    signal: params.signal,
  });

  const output = result.stdout.trim();
  if (params.output === "json") {
    return output.length === 0 ? {} : (JSON.parse(output) as unknown);
  }
  return output;
}

function normalizeFunctionSpec(input: CommandFunctionSpec): CommandFunctionSpec {
  return {
    ...input,
    returns: input.returns === "text" || input.returns === "json" ? input.returns : "void",
  };
}

export function createLiveCommandHandler(params: CommandHandlerParams) {
  const runtime = readRuntimeConfig();
  const boundFunctions = new Map<string, CommandFunctionSpec>();
  const running = new Map<string, RunningCommand>();
  const recentResults = new Map<string, RecentCommandResult>();

  function buildCancelledResult(callId: string, startedAt: number): CommandResultPayload {
    return {
      v: COMMAND_PROTOCOL_VERSION,
      callId,
      ok: false,
      error: buildCommandError("COMMAND_CANCELLED", "Command execution was cancelled."),
      durationMs: Date.now() - startedAt,
    };
  }

  function getSpec(name: string): CommandFunctionSpec | null {
    return boundFunctions.get(name) ?? null;
  }

  async function sendResult(payload: CommandResultPayload): Promise<void> {
    recentResults.set(payload.callId, {
      payload,
      expiresAt: Date.now() + DEFAULT_RECENT_RESULT_TTL_MS,
    });
    await params.sendCommandMessage(makeCommandResultMessage(payload));
  }

  async function sendBindResult(payload: CommandBindResultPayload): Promise<void> {
    await params.sendCommandMessage(makeCommandBindResultMessage(payload));
  }

  async function executeFunction(
    spec: CommandFunctionSpec,
    args: Record<string, unknown>,
    abortSignal: AbortSignal,
  ): Promise<unknown> {
    const executor = spec.executor;
    if (!executor) {
      throw new Error(`Function "${spec.name}" is missing executor definition.`);
    }
    const timeoutMs =
      (typeof executor.timeoutMs === "number" && executor.timeoutMs > 0
        ? executor.timeoutMs
        : undefined) ??
      (typeof spec.timeoutMs === "number" && spec.timeoutMs > 0 ? spec.timeoutMs : undefined) ??
      runtime.defaultTimeoutMs;
    const returnType = spec.returns === "json" || spec.returns === "text" ? spec.returns : "void";

    if (executor.kind === "exec") {
      const command = interpolateTemplate(executor.command, args);
      const commandArgs = (executor.args ?? []).map((entry) => interpolateTemplate(entry, args));
      const cwd = executor.cwd ? interpolateTemplate(executor.cwd, args) : undefined;
      const env = executor.env
        ? Object.fromEntries(
            Object.entries(executor.env).map(([key, value]) => [
              key,
              interpolateTemplate(value, args),
            ]),
          )
        : undefined;
      const result = await executeProcessCommand({
        command,
        args: commandArgs,
        cwd,
        env,
        timeoutMs,
        maxOutputBytes: runtime.maxOutputBytes,
        signal: abortSignal,
      });
      return toCommandReturnValue(result.stdout, returnType);
    }

    if (executor.kind === "shell") {
      const script = interpolateTemplate(executor.script, args);
      const cwd = executor.cwd ? interpolateTemplate(executor.cwd, args) : undefined;
      const result = await executeShellCommand({
        script,
        shell: executor.shell,
        cwd,
        timeoutMs,
        maxOutputBytes: runtime.maxOutputBytes,
        signal: abortSignal,
      });
      return toCommandReturnValue(result.stdout, returnType);
    }

    const agentSpec = executor as CommandAgentSpec;
    const prompt = interpolateTemplate(agentSpec.prompt, args);
    const output = agentSpec.output === "json" ? "json" : "text";
    const provider =
      agentSpec.provider && agentSpec.provider !== "auto"
        ? agentSpec.provider
        : params.bridgeMode === "openclaw"
          ? "openclaw"
          : "claude-code";

    if (provider === "openclaw") {
      return await executeOpenClawAgentCommand({
        prompt,
        timeoutMs,
        output,
        maxOutputBytes: runtime.maxOutputBytes,
        signal: abortSignal,
      });
    }
    return await executeClaudeAgentCommand({
      prompt,
      timeoutMs,
      output,
      maxOutputBytes: runtime.maxOutputBytes,
      signal: abortSignal,
    });
  }

  async function handleBind(message: CommandBindPayload): Promise<void> {
    const accepted: CommandBindResultPayload["accepted"] = [];
    const rejected: CommandBindResultPayload["rejected"] = [];
    boundFunctions.clear();

    for (const entry of message.functions) {
      const normalized = normalizeFunctionSpec(entry);
      if (!normalized.executor) {
        rejected.push({
          name: normalized.name,
          code: "INVALID_FUNCTION",
          message: `Function "${normalized.name}" is missing executor definition.`,
        });
        continue;
      }
      boundFunctions.set(normalized.name, normalized);
      accepted.push({
        name: normalized.name,
        returns: normalized.returns ?? "void",
      });
    }

    await sendBindResult({
      v: COMMAND_PROTOCOL_VERSION,
      manifestId: message.manifestId,
      accepted,
      rejected,
    });
  }

  async function handleInvoke(
    message: ReturnType<typeof parseCommandInvokeMessage>,
  ): Promise<void> {
    if (!message) return;
    const existing = recentResults.get(message.callId);
    if (existing && existing.expiresAt > Date.now()) {
      await sendResult(existing.payload);
      return;
    }
    if (running.has(message.callId)) return;
    if (running.size >= runtime.maxConcurrent) {
      await sendResult({
        v: COMMAND_PROTOCOL_VERSION,
        callId: message.callId,
        ok: false,
        error: buildCommandError("MAX_CONCURRENCY", "Too many commands are already running."),
        durationMs: 0,
      });
      return;
    }

    const spec = getSpec(message.name);
    if (!spec) {
      await sendResult({
        v: COMMAND_PROTOCOL_VERSION,
        callId: message.callId,
        ok: false,
        error: buildCommandError(
          "COMMAND_NOT_FOUND",
          `Command "${message.name}" is not registered.`,
        ),
        durationMs: 0,
      });
      return;
    }

    const abort = new AbortController();
    const startedAt = Date.now();
    running.set(message.callId, { abort, startedAt, cancelled: false });

    try {
      const value = await executeFunction(spec, message.args ?? {}, abort.signal);
      const active = running.get(message.callId);
      if (abort.signal.aborted || active?.cancelled) {
        await sendResult(buildCancelledResult(message.callId, startedAt));
        return;
      }
      await sendResult({
        v: COMMAND_PROTOCOL_VERSION,
        callId: message.callId,
        ok: true,
        value: spec.returns === "void" ? null : value,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const detail =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Command execution failed";
      if (abort.signal.aborted || running.get(message.callId)?.cancelled) {
        await sendResult(buildCancelledResult(message.callId, startedAt));
        return;
      }
      await sendResult({
        v: COMMAND_PROTOCOL_VERSION,
        callId: message.callId,
        ok: false,
        error: buildCommandError("COMMAND_EXECUTION_FAILED", detail),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      running.delete(message.callId);
    }
  }

  async function handleCancel(
    message: ReturnType<typeof parseCommandCancelMessage>,
  ): Promise<void> {
    if (!message) return;
    const active = running.get(message.callId);
    if (!active) return;
    active.cancelled = true;
    active.abort.abort();
  }

  async function handleBridgeMessage(message: BridgeMessage): Promise<void> {
    if (message.type !== "event") return;

    for (const [callId, result] of recentResults) {
      if (result.expiresAt <= Date.now()) {
        recentResults.delete(callId);
      }
    }

    const bind = parseCommandBindMessage(message);
    if (bind) {
      await handleBind(bind);
      return;
    }

    const invoke = parseCommandInvokeMessage(message);
    if (invoke) {
      await handleInvoke(invoke);
      return;
    }

    const cancel = parseCommandCancelMessage(message);
    if (cancel) {
      await handleCancel(cancel);
    }
  }

  return {
    stop(): void {
      for (const [callId, active] of running) {
        active.abort.abort();
        running.delete(callId);
      }
    },
    async onMessage(message: BridgeMessage): Promise<void> {
      await handleBridgeMessage(message).catch((error) => {
        params.markError("command handler failed", error);
      });
    },
  };
}
