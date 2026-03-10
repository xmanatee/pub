import { join } from "node:path";
import {
  type BridgeSettings,
  DEFAULT_CANVAS_REMINDER_EVERY,
  DEFAULT_COMMAND_MAX_CONCURRENT,
  DEFAULT_COMMAND_MAX_OUTPUT_BYTES,
  DEFAULT_COMMAND_TIMEOUT_MS,
  getConfigDir,
  type PubBridgeConfig,
} from "../../core/config/index.js";
import type { BridgeMode } from "../daemon/shared.js";

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveIntegerEnv(envKey: string, raw: string | undefined): number | undefined {
  const trimmed = trimToUndefined(raw);
  if (trimmed === undefined) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new Error(`Invalid positive integer value for ${envKey}: ${raw}`);
}

function stringValueOrEnv(value: string | undefined, envKey: string, env: NodeJS.ProcessEnv): string | undefined {
  return trimToUndefined(env[envKey]) ?? trimToUndefined(value);
}

function integerValueOrEnv(
  value: number | undefined,
  envKey: string,
  env: NodeJS.ProcessEnv,
): number | undefined {
  return parsePositiveIntegerEnv(envKey, env[envKey]) ?? value;
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

export function buildBridgeProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!env.PUB_PROJECT_ROOT?.trim()) {
    env.PUB_PROJECT_ROOT = process.cwd();
  }
  return env;
}

export function buildBridgeSettings(
  mode: BridgeMode,
  bridgeConfig: PubBridgeConfig,
  env: NodeJS.ProcessEnv = process.env,
): BridgeSettings {
  const projectRoot = trimToUndefined(env.PUB_PROJECT_ROOT) || process.cwd();
  const openclawWorkspace = trimToUndefined(env.OPENCLAW_WORKSPACE);
  const bridgeCwd =
    trimToUndefined(bridgeConfig.bridgeCwd) ||
    (mode === "openclaw" ? openclawWorkspace : projectRoot);

  if (!bridgeCwd) {
    throw new Error(
      mode === "openclaw"
        ? "OpenClaw workspace is not configured. Set OPENCLAW_WORKSPACE or save bridge.cwd."
        : "Bridge cwd is not configured.",
    );
  }

  const base = {
    mode,
    verbose: bridgeConfig.verbose === true,
    bridgeCwd,
    canvasReminderEvery: positiveIntOr(
      bridgeConfig.canvasReminderEvery,
      DEFAULT_CANVAS_REMINDER_EVERY,
    ),
    attachmentDir:
      trimToUndefined(bridgeConfig.attachmentDir) || join(getConfigDir(env), "attachments"),
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
    openclawStateDir: stringValueOrEnv(bridgeConfig.openclawStateDir, "OPENCLAW_STATE_DIR", env),
    threadId: stringValueOrEnv(bridgeConfig.threadId, "OPENCLAW_THREAD_ID", env),
    claudeCodeMaxTurns:
      positiveIntOr(integerValueOrEnv(bridgeConfig.claudeCodeMaxTurns, "CLAUDE_CODE_MAX_TURNS", env), 0) ||
      undefined,
  };

  if (mode === "openclaw") {
    return {
      ...base,
      mode,
      openclawPath: requireString(
        stringValueOrEnv(bridgeConfig.openclawPath, "OPENCLAW_PATH", env),
        "openclaw.path",
      ),
      sessionId: requireString(
        stringValueOrEnv(bridgeConfig.sessionId, "OPENCLAW_SESSION_ID", env),
        "openclaw.sessionId",
      ),
    };
  }

  return {
    ...base,
    mode,
    claudeCodePath: requireString(
      stringValueOrEnv(bridgeConfig.claudeCodePath, "CLAUDE_CODE_PATH", env),
      "claude-code.path",
    ),
  };
}
