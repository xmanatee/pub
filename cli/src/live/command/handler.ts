import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import {
  COMMAND_PROTOCOL_VERSION,
  type CommandFunctionSpec,
  extractManifestFromHtml,
  makeCommandResultMessage,
  parseCommandCancelMessage,
  parseCommandInvokeMessage,
} from "../../../../shared/command-protocol-core";
import type { LiveExecutorState } from "../../../../shared/live-runtime-state-core";
import { executeCommandSpec } from "./run-spec.js";
import {
  buildCommandError,
  type CommandHandlerParams,
  DEFAULT_RECENT_RESULT_TTL_MS,
  getCommandRuntimeConfig,
  normalizeFunctionSpec,
  type RecentCommandResult,
  type RunningCommand,
} from "./shared.js";

export function createLiveCommandHandler(params: CommandHandlerParams) {
  const boundFunctions = new Map<string, CommandFunctionSpec>();
  const running = new Map<string, RunningCommand>();
  const recentResults = new Map<string, RecentCommandResult>();
  let executorState: LiveExecutorState = "idle";
  let pendingUntilManifest: BridgeMessage[] = [];

  function currentBridgeSettings() {
    return params.getRuntimeBridgeSettings?.() ?? params.bridgeSettings;
  }

  function currentRuntime() {
    return getCommandRuntimeConfig(currentBridgeSettings());
  }

  function setExecutorState(nextState: LiveExecutorState): void {
    if (executorState === nextState) return;
    executorState = nextState;
    params.onExecutorStateChange?.(nextState);
  }

  function clearBindings(): void {
    boundFunctions.clear();
    setExecutorState("idle");
    pendingUntilManifest = [];
    params.debugLog("commands cleared bindings");
  }

  function beginManifestLoad(): void {
    boundFunctions.clear();
    if (executorState === "loading") {
      params.debugLog("commands continuing manifest load");
      return;
    }
    setExecutorState("loading");
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

  function executeFunction(
    spec: CommandFunctionSpec,
    args: Record<string, unknown>,
    abortSignal: AbortSignal,
    requestedTimeoutMs?: number,
  ): Promise<unknown> {
    return executeCommandSpec(spec, args, {
      bridgeSettings: currentBridgeSettings(),
      signal: abortSignal,
      requestedTimeoutMs,
      getBridgeRunner: params.getBridgeRunner,
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
    setExecutorState("ready");
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
      // A missing manifest is normal for pubs that expose no canvas-invokable
      // commands. Only warn when a canvas rewrite *dropped* previously-bound
      // commands — that's a likely regression the operator wants to notice.
      const hadBindings = boundFunctions.size > 0;
      boundFunctions.clear();
      if (hadBindings) {
        params.debugLog("commands cleared — new canvas has no manifest");
      }
      const queued = pendingUntilManifest.splice(0);
      setExecutorState("idle");
      for (const message of queued) {
        void handleBridgeMessage(message);
      }
      return;
    }
    // Force a state transition so the browser is always notified when
    // commands are rebound — even if executorState was already "ready".
    if (executorState === "ready") {
      setExecutorState("loading");
    }
    params.debugLog(`commands manifestId=${manifest.manifestId}`);
    bindFunctions(manifest.functions);
  }

  async function handleInvoke(
    message: ReturnType<typeof parseCommandInvokeMessage>,
  ): Promise<void> {
    if (!message) return;
    const runtime = currentRuntime();
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
        error: buildCommandError(
          "COMMAND_NOT_FOUND",
          `Command "${message.name}" is not registered.`,
        ),
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
      const value = await executeFunction(
        spec,
        message.args ?? {},
        abort.signal,
        message.timeoutMs,
      );
      const active = running.get(message.callId);
      if (abort.signal.aborted || active?.cancelled) {
        params.debugLog(
          `commands invoke "${message.name}" cancelled after ${Date.now() - startedAt}ms`,
        );
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

    if (executorState === "loading") {
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
