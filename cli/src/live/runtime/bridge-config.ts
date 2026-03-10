import { join } from "node:path";
import {
  type BridgeConfig,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  DEFAULT_BRIDGE_DELIVER_TIMEOUT_MS,
  DEFAULT_CANVAS_REMINDER_EVERY,
  DEFAULT_COMMAND_MAX_CONCURRENT,
  DEFAULT_COMMAND_MAX_OUTPUT_BYTES,
  DEFAULT_COMMAND_TIMEOUT_MS,
  getConfigDir,
  type PreparedBridgeConfig,
} from "../../core/config/index.js";
import type { BridgeMode } from "../daemon/shared.js";

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveIntOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function requireString(value: string | undefined, label: string): string {
  const trimmed = trimToUndefined(value);
  if (!trimmed) {
    throw new Error(`${label} is not configured. Run \`pub config --auto\` or set it explicitly.`);
  }
  return trimmed;
}

function requirePositiveInt(value: number | undefined, label: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new Error(`${label} is not configured. Run \`pub config --auto\` or set it explicitly.`);
}

export function buildBridgeProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!env.PUB_PROJECT_ROOT?.trim()) {
    env.PUB_PROJECT_ROOT = process.cwd();
  }
  return env;
}

export function parseBridgeMode(raw: string): BridgeMode {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "openclaw" || normalized === "claude-code" || normalized === "claude-sdk") {
    return normalized;
  }
  throw new Error(`--bridge must be one of: openclaw, claude-code, claude-sdk. Received: ${raw}`);
}

export function prepareBridgeConfigForSave(
  mode: BridgeMode,
  bridgeConfig: BridgeConfig,
  env: NodeJS.ProcessEnv = process.env,
): PreparedBridgeConfig {
  const projectRoot = trimToUndefined(env.PUB_PROJECT_ROOT) || process.cwd();
  const bridgeCwd =
    trimToUndefined(bridgeConfig.bridgeCwd) || (mode === "openclaw" ? undefined : projectRoot);
  if (!bridgeCwd) {
    throw new Error(
      mode === "openclaw"
        ? "OpenClaw workspace is not configured. Set OPENCLAW_WORKSPACE before `pub config --auto`, or save bridge.cwd."
        : "Bridge cwd is not configured.",
    );
  }

  const base = {
    bridgeCwd,
    canvasReminderEvery: positiveIntOr(
      bridgeConfig.canvasReminderEvery,
      DEFAULT_CANVAS_REMINDER_EVERY,
    ),
    deliver: bridgeConfig.deliver === true,
    deliverTimeoutMs: positiveIntOr(
      bridgeConfig.deliverTimeoutMs,
      DEFAULT_BRIDGE_DELIVER_TIMEOUT_MS,
    ),
    attachmentDir:
      trimToUndefined(bridgeConfig.attachmentDir) || join(getConfigDir(env), "attachments"),
    attachmentMaxBytes: positiveIntOr(
      bridgeConfig.attachmentMaxBytes,
      DEFAULT_ATTACHMENT_MAX_BYTES,
    ),
    commandDefaultTimeoutMs: positiveIntOr(
      bridgeConfig.commandDefaultTimeoutMs,
      DEFAULT_COMMAND_TIMEOUT_MS,
    ),
    commandMaxOutputBytes: positiveIntOr(
      bridgeConfig.commandMaxOutputBytes,
      DEFAULT_COMMAND_MAX_OUTPUT_BYTES,
    ),
    commandMaxConcurrent: positiveIntOr(
      bridgeConfig.commandMaxConcurrent,
      DEFAULT_COMMAND_MAX_CONCURRENT,
    ),
    openclawStateDir: trimToUndefined(bridgeConfig.openclawStateDir),
    threadId: trimToUndefined(bridgeConfig.threadId),
    deliverChannel: trimToUndefined(bridgeConfig.deliverChannel),
    claudeCodeModel: trimToUndefined(bridgeConfig.claudeCodeModel),
    claudeCodeAllowedTools: trimToUndefined(bridgeConfig.claudeCodeAllowedTools),
    claudeCodeAppendSystemPrompt: trimToUndefined(bridgeConfig.claudeCodeAppendSystemPrompt),
    claudeCodeMaxTurns: positiveIntOr(bridgeConfig.claudeCodeMaxTurns, 0) || undefined,
  };

  if (mode === "openclaw") {
    return {
      ...base,
      mode,
      openclawPath: requireString(trimToUndefined(bridgeConfig.openclawPath), "openclaw.path"),
      sessionId: requireString(trimToUndefined(bridgeConfig.sessionId), "openclaw.sessionId"),
    };
  }

  return {
    ...base,
    mode,
    claudeCodePath: requireString(trimToUndefined(bridgeConfig.claudeCodePath), "claude-code.path"),
  };
}

export function validatePreparedBridgeConfig(
  mode: BridgeMode,
  bridgeConfig: BridgeConfig,
): PreparedBridgeConfig {
  const base = {
    bridgeCwd: requireString(bridgeConfig.bridgeCwd, "bridge.cwd"),
    canvasReminderEvery: requirePositiveInt(
      bridgeConfig.canvasReminderEvery,
      "bridge.canvasReminderEvery",
    ),
    deliver: bridgeConfig.deliver === true,
    deliverTimeoutMs: requirePositiveInt(
      bridgeConfig.deliverTimeoutMs,
      "bridge.deliverTimeoutMs",
    ),
    attachmentDir: requireString(bridgeConfig.attachmentDir, "bridge.attachmentDir"),
    attachmentMaxBytes: requirePositiveInt(
      bridgeConfig.attachmentMaxBytes,
      "bridge.attachmentMaxBytes",
    ),
    commandDefaultTimeoutMs: requirePositiveInt(
      bridgeConfig.commandDefaultTimeoutMs,
      "command.defaultTimeoutMs",
    ),
    commandMaxOutputBytes: requirePositiveInt(
      bridgeConfig.commandMaxOutputBytes,
      "command.maxOutputBytes",
    ),
    commandMaxConcurrent: requirePositiveInt(
      bridgeConfig.commandMaxConcurrent,
      "command.maxConcurrent",
    ),
    openclawStateDir: trimToUndefined(bridgeConfig.openclawStateDir),
    threadId: trimToUndefined(bridgeConfig.threadId),
    deliverChannel: trimToUndefined(bridgeConfig.deliverChannel),
    claudeCodeModel: trimToUndefined(bridgeConfig.claudeCodeModel),
    claudeCodeAllowedTools: trimToUndefined(bridgeConfig.claudeCodeAllowedTools),
    claudeCodeAppendSystemPrompt: trimToUndefined(bridgeConfig.claudeCodeAppendSystemPrompt),
    claudeCodeMaxTurns:
      typeof bridgeConfig.claudeCodeMaxTurns === "number" &&
      Number.isFinite(bridgeConfig.claudeCodeMaxTurns) &&
      bridgeConfig.claudeCodeMaxTurns > 0
        ? bridgeConfig.claudeCodeMaxTurns
        : undefined,
  };

  if (mode === "openclaw") {
    return {
      ...base,
      mode,
      openclawPath: requireString(bridgeConfig.openclawPath, "openclaw.path"),
      sessionId: requireString(bridgeConfig.sessionId, "openclaw.sessionId"),
    };
  }

  return {
    ...base,
    mode,
    claudeCodePath: requireString(bridgeConfig.claudeCodePath, "claude-code.path"),
  };
}
