import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import {
  COMMAND_PROTOCOL_VERSION,
  type CommandAgentSpec,
  type CommandFunctionSpec,
  extractManifestFromHtml,
  makeCommandResultMessage,
  parseCommandCancelMessage,
  parseCommandInvokeMessage,
} from "../../../../shared/command-protocol-core";
import { executeClaudeAgentCommand, executeOpenClawAgentCommand } from "./executors/agent.js";
import { executeProcessCommand, executeShellCommand } from "./executors/process.js";
import {
  buildCommandError,
  type CommandHandlerParams,
  DEFAULT_RECENT_RESULT_TTL_MS,
  getCommandRuntimeConfig,
  normalizeFunctionSpec,
  type RecentCommandResult,
  type RunningCommand,
} from "./shared.js";
import { interpolateTemplate, toCommandReturnValue } from "./template.js";

export function createLiveCommandHandler(params: CommandHandlerParams) {
  const runtime = getCommandRuntimeConfig(params.bridgeSettings);
  const boundFunctions = new Map<string, CommandFunctionSpec>();
  const running = new Map<string, RunningCommand>();
  const recentResults = new Map<string, RecentCommandResult>();
  let manifestLoaded = true;
  let pendingUntilManifest: BridgeMessage[] = [];

  function clearBindings(): void {
    boundFunctions.clear();
    manifestLoaded = true;
    pendingUntilManifest = [];
    params.debugLog("commands cleared bindings");
  }

  function beginManifestLoad(): void {
    boundFunctions.clear();
    manifestLoaded = false;
    pendingUntilManifest = [];
    params.debugLog("commands awaiting manifest load");
  }

  function buildCancelledResult(callId: string, startedAt: number) {
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

  async function sendResult(payload: RecentCommandResult["payload"]): Promise<void> {
    recentResults.set(payload.callId, {
      payload,
      expiresAt: Date.now() + DEFAULT_RECENT_RESULT_TTL_MS,
    });
    await params.sendCommandMessage(makeCommandResultMessage(payload));
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
        : params.bridgeSettings.mode === "openclaw"
          ? "openclaw"
          : "claude-code";

    if (provider === "openclaw") {
      return await executeOpenClawAgentCommand({
        prompt,
        timeoutMs,
        output,
        maxOutputBytes: runtime.maxOutputBytes,
        signal: abortSignal,
        bridgeSettings: params.bridgeSettings,
      });
    }

    return await executeClaudeAgentCommand({
      prompt,
      timeoutMs,
      output,
      maxOutputBytes: runtime.maxOutputBytes,
      signal: abortSignal,
      bridgeSettings: params.bridgeSettings,
    });
  }

  function bindFunctions(functions: CommandFunctionSpec[]): void {
    boundFunctions.clear();
    for (const entry of functions) {
      const normalized = normalizeFunctionSpec(entry);
      if (!normalized.executor) {
        params.debugLog(`commands skipped "${normalized.name}" — missing executor`);
        continue;
      }
      boundFunctions.set(normalized.name, normalized);
    }
    params.debugLog(`commands bound=[${[...boundFunctions.keys()].join(", ")}]`);
    const queued = pendingUntilManifest.splice(0);
    manifestLoaded = true;
    if (queued.length > 0) {
      params.debugLog(`commands replaying ${queued.length} queued message(s)`);
      for (const message of queued) {
        void handleBridgeMessage(message);
      }
    }
  }

  function bindFromHtml(html: string): void {
    const manifest = extractManifestFromHtml(html);
    if (!manifest) {
      boundFunctions.clear();
      params.debugLog("commands no manifest found in HTML");
      const queued = pendingUntilManifest.splice(0);
      manifestLoaded = true;
      for (const message of queued) {
        void handleBridgeMessage(message);
      }
      return;
    }
    params.debugLog(`commands manifestId=${manifest.manifestId}`);
    bindFunctions(manifest.functions);
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
      params.debugLog(`commands invoke COMMAND_NOT_FOUND "${message.name}"`);
      await sendResult({
        v: COMMAND_PROTOCOL_VERSION,
        callId: message.callId,
        ok: false,
        error: buildCommandError("COMMAND_NOT_FOUND", `Command "${message.name}" is not registered.`),
        durationMs: 0,
      });
      return;
    }

    params.debugLog(
      `commands invoke "${message.name}" callId=${message.callId} args=${JSON.stringify(message.args ?? {}).slice(0, 200)}`,
    );

    const abort = new AbortController();
    const startedAt = Date.now();
    running.set(message.callId, { abort, startedAt, cancelled: false });

    try {
      const value = await executeFunction(spec, message.args ?? {}, abort.signal);
      const active = running.get(message.callId);
      if (abort.signal.aborted || active?.cancelled) {
        params.debugLog(`commands invoke "${message.name}" cancelled after ${Date.now() - startedAt}ms`);
        await sendResult(buildCancelledResult(message.callId, startedAt));
        return;
      }
      const durationMs = Date.now() - startedAt;
      params.debugLog(
        `commands invoke "${message.name}" ok=${true} duration=${durationMs}ms value=${JSON.stringify(value).slice(0, 200)}`,
      );
      await sendResult({
        v: COMMAND_PROTOCOL_VERSION,
        callId: message.callId,
        ok: true,
        value: spec.returns === "void" ? null : value,
        durationMs,
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
      const durationMs = Date.now() - startedAt;
      params.debugLog(
        `commands invoke "${message.name}" FAILED duration=${durationMs}ms error=${detail.slice(0, 300)}`,
      );
      await sendResult({
        v: COMMAND_PROTOCOL_VERSION,
        callId: message.callId,
        ok: false,
        error: buildCommandError("COMMAND_EXECUTION_FAILED", detail),
        durationMs,
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

    params.debugLog(
      `commands message type=${message.type} data=${typeof message.data === "string" ? message.data.slice(0, 120) : "?"}`,
    );

    if (!manifestLoaded) {
      params.debugLog("commands queuing message (manifest not loaded yet)");
      pendingUntilManifest.push(message);
      return;
    }

    for (const [callId, result] of recentResults) {
      if (result.expiresAt <= Date.now()) {
        recentResults.delete(callId);
      }
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
    bindFromHtml,
    beginManifestLoad,
    clearBindings,
    stop(): void {
      for (const [callId, active] of running) {
        active.abort.abort();
        running.delete(callId);
      }
      clearBindings();
    },
    async onMessage(message: BridgeMessage): Promise<void> {
      await handleBridgeMessage(message).catch((error) => {
        params.markError("command handler failed", error);
      });
    },
  };
}
