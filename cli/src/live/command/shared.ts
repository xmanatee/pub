import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import type {
  CommandErrorPayload,
  CommandFunctionSpec,
  CommandResultPayload,
} from "../../../../shared/command-protocol-core";
import type { BridgeSettings } from "../../core/config/index.js";
import type { BridgeRunner } from "../bridge/shared.js";

export const DEFAULT_RECENT_RESULT_TTL_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_CONCURRENT = 6;

export interface CommandHandlerParams {
  bridgeSettings: BridgeSettings;
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  sendCommandMessage: (msg: BridgeMessage) => Promise<boolean>;
  getBridgeRunner?: () => BridgeRunner | null;
}

export interface RunningCommand {
  abort: AbortController;
  cancelled: boolean;
  startedAt: number;
}

export interface RecentCommandResult {
  expiresAt: number;
  payload: CommandResultPayload;
}

export interface CommandRuntimeConfig {
  defaultTimeoutMs: number;
  maxConcurrent: number;
  maxOutputBytes: number;
}

function readPositiveTimeoutMs(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function getCommandRuntimeConfig(
  bridgeSettings: BridgeSettings,
): CommandRuntimeConfig {
  return {
    defaultTimeoutMs: bridgeSettings.commandDefaultTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: bridgeSettings.commandMaxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    maxConcurrent: bridgeSettings.commandMaxConcurrent ?? DEFAULT_MAX_CONCURRENT,
  };
}

export function buildCommandError(
  code: string,
  message: string,
  retryable = false,
): CommandErrorPayload {
  return { code, message, retryable };
}

export function normalizeFunctionSpec(input: CommandFunctionSpec): CommandFunctionSpec {
  return {
    ...input,
    returns: input.returns === "text" || input.returns === "json" ? input.returns : "void",
  };
}

export function resolveCommandTimeoutMs(params: {
  requestedTimeoutMs?: number;
  spec: CommandFunctionSpec;
  runtime: CommandRuntimeConfig;
}): number {
  const executorTimeoutMs = readPositiveTimeoutMs(params.spec.executor?.timeoutMs);
  const specTimeoutMs = readPositiveTimeoutMs(params.spec.timeoutMs);
  const requestedTimeoutMs = readPositiveTimeoutMs(params.requestedTimeoutMs);

  return requestedTimeoutMs ?? executorTimeoutMs ?? specTimeoutMs ?? params.runtime.defaultTimeoutMs;
}
