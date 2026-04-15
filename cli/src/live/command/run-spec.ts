/**
 * Standalone executor for a {@link CommandFunctionSpec}. Used by both the
 * live bridge command handler (for canvas pubs) and the IPC `run-command-spec`
 * action (for the super-app and any local caller). Kept free of runtime state
 * so callers own concurrency, cancellation, and logging.
 */
import type { BridgeSettings } from "../../core/config/index.js";
import type {
  CommandAgentSpec,
  CommandFunctionSpec,
} from "../../../../shared/command-protocol-core";
import { executeAgentCommand } from "../bridge/providers/agent-command.js";
import type { BridgeRunner } from "../bridge/shared.js";
import { executeProcessCommand, executeShellCommand } from "./executors/process.js";
import {
  getCommandRuntimeConfig,
  normalizeFunctionSpec,
  resolveCommandTimeoutMs,
} from "./shared.js";
import { interpolateTemplate, toCommandReturnValue } from "./template.js";
import { resolveWorkspaceCwd } from "./workspace-path.js";

export interface RunCommandSpecOptions {
  bridgeSettings: BridgeSettings;
  signal: AbortSignal;
  requestedTimeoutMs?: number;
  getBridgeRunner?: () => BridgeRunner | null;
}

export async function executeCommandSpec(
  rawSpec: CommandFunctionSpec,
  args: Record<string, unknown>,
  options: RunCommandSpecOptions,
): Promise<unknown> {
  const spec = normalizeFunctionSpec(rawSpec);
  const executor = spec.executor;
  if (!executor) {
    throw new Error(`Function "${spec.name}" is missing executor definition.`);
  }
  const runtime = getCommandRuntimeConfig(options.bridgeSettings);
  const timeoutMs = resolveCommandTimeoutMs({
    requestedTimeoutMs: options.requestedTimeoutMs,
    spec,
    runtime,
  });
  const returnType = spec.returns === "json" || spec.returns === "text" ? spec.returns : "void";

  if (executor.kind === "exec") {
    const result = await executeProcessCommand({
      command: interpolateTemplate(executor.command, args),
      args: (executor.args ?? []).map((entry) => interpolateTemplate(entry, args)),
      cwd: resolveWorkspaceCwd(executor.cwd, args, options.bridgeSettings),
      env: executor.env ? interpolateEnvRecord(executor.env, args) : undefined,
      timeoutMs,
      maxOutputBytes: runtime.maxOutputBytes,
      signal: options.signal,
    });
    return toCommandReturnValue(result.stdout, returnType);
  }

  if (executor.kind === "shell") {
    const result = await executeShellCommand({
      script: interpolateTemplate(executor.script, args),
      shell: executor.shell,
      cwd: resolveWorkspaceCwd(executor.cwd, args, options.bridgeSettings),
      timeoutMs,
      maxOutputBytes: runtime.maxOutputBytes,
      signal: options.signal,
    });
    return toCommandReturnValue(result.stdout, returnType);
  }

  return executeAgentSpec(executor, args, timeoutMs, runtime.maxOutputBytes, options);
}

function interpolateEnvRecord(
  env: Record<string, string>,
  args: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, interpolateTemplate(value, args)]),
  );
}

async function executeAgentSpec(
  agent: CommandAgentSpec,
  args: Record<string, unknown>,
  timeoutMs: number,
  maxOutputBytes: number,
  options: RunCommandSpecOptions,
): Promise<unknown> {
  const prompt = interpolateTemplate(agent.prompt, args);
  const output = agent.output === "json" ? "json" : "text";
  return executeAgentCommand({
    spec: agent,
    prompt,
    timeoutMs,
    output,
    maxOutputBytes,
    signal: options.signal,
    bridgeSettings: options.bridgeSettings,
    getBridgeRunner: options.getBridgeRunner,
  });
}
