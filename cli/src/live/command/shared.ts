import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import type {
  CommandErrorPayload,
  CommandFunctionSpec,
  CommandResultPayload,
} from "../../../../shared/command-protocol-core";
import type { PreparedBridgeConfig } from "../../core/config/index.js";
import type { BridgeMode } from "../daemon/shared.js";

export const DEFAULT_RECENT_RESULT_TTL_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_CONCURRENT = 6;

export interface CommandHandlerParams {
  bridgeMode: BridgeMode;
  bridgeConfig: PreparedBridgeConfig;
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  sendCommandMessage: (msg: BridgeMessage) => Promise<boolean>;
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

export function getCommandRuntimeConfig(
  bridgeConfig: PreparedBridgeConfig,
): CommandRuntimeConfig {
  return {
    defaultTimeoutMs: bridgeConfig.commandDefaultTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: bridgeConfig.commandMaxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    maxConcurrent: bridgeConfig.commandMaxConcurrent ?? DEFAULT_MAX_CONCURRENT,
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
