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
} from "../config.js";
import { join } from "node:path";
import {
  isClaudeCodeAvailableInEnv,
  runClaudeCodeBridgeStartupProbe,
} from "../live-bridge-claude-code.js";
import {
  isClaudeSdkAvailableInEnv,
  isClaudeSdkImportable,
  runClaudeSdkBridgeStartupProbe,
} from "../live-bridge-claude-sdk.js";
import { isOpenClawAvailable, runOpenClawBridgeStartupProbe } from "../live-bridge-openclaw.js";
import type { BridgeMode } from "../live-daemon-shared.js";

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

interface BridgeProvider {
  mode: BridgeMode;
  priority: number;
  detect(env: NodeJS.ProcessEnv, bridgeConfig?: BridgeConfig): { available: boolean; detail: string };
  startupProbe(
    env: NodeJS.ProcessEnv,
    bridgeConfig: BridgeConfig | PreparedBridgeConfig | undefined,
    options: { strictConfig: boolean },
  ): Promise<BridgeStartupProbeResult>;
}

export interface BridgeStartupProbeResult {
  detailLines: string[];
  configPatch?: Partial<BridgeConfig>;
}

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

function describeConfiguredPath(key: string, env: NodeJS.ProcessEnv): string {
  const configured = env[key]?.trim();
  return configured ? `${key}=${configured}` : `${key} not set`;
}

const BRIDGE_PROVIDERS: BridgeProvider[] = [
  {
    mode: "openclaw" as const,
    priority: 100,
    detect(env: NodeJS.ProcessEnv, bridgeConfig?: BridgeConfig) {
      const available = isOpenClawAvailable(env, bridgeConfig);
      if (available) {
        return {
          available: true,
          detail: `OpenClaw runtime detected (${describeConfiguredPath("OPENCLAW_PATH", env)})`,
        };
      }
      return {
        available: false,
        detail: `OpenClaw runtime not detected (${describeConfiguredPath("OPENCLAW_PATH", env)})`,
      };
    },
    async startupProbe(
      env: NodeJS.ProcessEnv,
      bridgeConfig: BridgeConfig | PreparedBridgeConfig | undefined,
      options: { strictConfig: boolean },
    ) {
      const runtime = await runOpenClawBridgeStartupProbe(env, bridgeConfig, options);
      return {
        detailLines: [
          `OpenClaw executable: ${runtime.openclawPath}`,
          `OpenClaw session: ${runtime.sessionId} (${runtime.sessionSource ?? "unknown"})`,
          'OpenClaw communication via `pub write "pong"`: OK',
        ],
        configPatch: {
          mode: "openclaw" as const,
          openclawPath: runtime.openclawPath,
          openclawStateDir: env.OPENCLAW_STATE_DIR?.trim() || bridgeConfig?.openclawStateDir,
          sessionId: runtime.sessionId,
          threadId: env.OPENCLAW_THREAD_ID?.trim() || bridgeConfig?.threadId,
          bridgeCwd: env.OPENCLAW_WORKSPACE?.trim(),
        },
      };
    },
  },
  {
    mode: "claude-sdk" as const,
    priority: 75,
    detect(env: NodeJS.ProcessEnv, bridgeConfig?: BridgeConfig) {
      if (!isClaudeCodeAvailableInEnv(env, bridgeConfig)) {
        return {
          available: false,
          detail: `Claude CLI not detected (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
        };
      }
      if (!isClaudeSdkAvailableInEnv(env, bridgeConfig)) {
        return {
          available: false,
          detail: `Claude Agent SDK not importable (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
        };
      }
      return {
        available: true,
        detail: `Claude CLI detected and SDK importable (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
      };
    },
    async startupProbe(
      env: NodeJS.ProcessEnv,
      bridgeConfig: BridgeConfig | PreparedBridgeConfig | undefined,
      options: { strictConfig: boolean },
    ) {
      const sdkAvailable = await isClaudeSdkImportable();
      if (!sdkAvailable) {
        throw new Error(
          "Claude Agent SDK (@anthropic-ai/claude-agent-sdk) is not importable. Install it or use --bridge claude-code.",
        );
      }
      const runtime = await runClaudeSdkBridgeStartupProbe(env, bridgeConfig, options);
      const cwd = runtime.cwd || env.PUB_PROJECT_ROOT || process.cwd();
      return {
        detailLines: [
          `Claude executable: ${runtime.claudePath}`,
          `Claude SDK: available`,
          `Claude cwd: ${cwd}`,
          'Claude SDK communication via `pub write "pong"`: OK',
        ],
        configPatch: {
          mode: "claude-sdk" as const,
          claudeCodePath: runtime.claudePath,
          claudeCodeModel: env.CLAUDE_CODE_MODEL?.trim() || bridgeConfig?.claudeCodeModel,
          claudeCodeAllowedTools:
            env.CLAUDE_CODE_ALLOWED_TOOLS?.trim() || bridgeConfig?.claudeCodeAllowedTools,
          claudeCodeAppendSystemPrompt:
            env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim() || bridgeConfig?.claudeCodeAppendSystemPrompt,
          claudeCodeMaxTurns:
            env.CLAUDE_CODE_MAX_TURNS?.trim()
              ? Number.parseInt(env.CLAUDE_CODE_MAX_TURNS, 10)
              : bridgeConfig?.claudeCodeMaxTurns,
          bridgeCwd: runtime.cwd,
        },
      };
    },
  },
  {
    mode: "claude-code" as const,
    priority: 50,
    detect(env: NodeJS.ProcessEnv, bridgeConfig?: BridgeConfig) {
      const available = isClaudeCodeAvailableInEnv(env, bridgeConfig);
      if (available) {
        return {
          available: true,
          detail: `Claude Code runtime detected (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
        };
      }
      return {
        available: false,
        detail: `Claude Code runtime not detected (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
      };
    },
    async startupProbe(
      env: NodeJS.ProcessEnv,
      bridgeConfig: BridgeConfig | PreparedBridgeConfig | undefined,
      options: { strictConfig: boolean },
    ) {
      const runtime = await runClaudeCodeBridgeStartupProbe(env, bridgeConfig, options);
      const cwd = runtime.cwd || env.PUB_PROJECT_ROOT || process.cwd();
      return {
        detailLines: [
          `Claude executable: ${runtime.claudePath}`,
          `Claude cwd: ${cwd}`,
          'Claude communication via `pub write "pong"`: OK',
        ],
        configPatch: {
          mode: "claude-code" as const,
          claudeCodePath: runtime.claudePath,
          claudeCodeModel: env.CLAUDE_CODE_MODEL?.trim() || bridgeConfig?.claudeCodeModel,
          claudeCodeAllowedTools:
            env.CLAUDE_CODE_ALLOWED_TOOLS?.trim() || bridgeConfig?.claudeCodeAllowedTools,
          claudeCodeAppendSystemPrompt:
            env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim() || bridgeConfig?.claudeCodeAppendSystemPrompt,
          claudeCodeMaxTurns:
            env.CLAUDE_CODE_MAX_TURNS?.trim()
              ? Number.parseInt(env.CLAUDE_CODE_MAX_TURNS, 10)
              : bridgeConfig?.claudeCodeMaxTurns,
          bridgeCwd: runtime.cwd,
        },
      };
    },
  },
].sort((a, b) => b.priority - a.priority);

function getBridgeProvider(mode: BridgeMode): BridgeProvider {
  const provider = BRIDGE_PROVIDERS.find((entry) => entry.mode === mode);
  if (!provider) {
    throw new Error(`Unsupported bridge provider: ${mode}`);
  }
  return provider;
}

export interface BridgeSelection {
  mode: BridgeMode;
  source: "explicit" | "config";
  detail: string;
}

export function createBridgeSelection(
  mode: BridgeMode,
  source: "explicit" | "config",
): BridgeSelection {
  return {
    mode,
    source,
    detail: source === "explicit" ? "requested via --bridge" : "loaded from config",
  };
}

export async function runBridgeStartupPreflight(
  selection: BridgeSelection,
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig: PreparedBridgeConfig,
): Promise<BridgeStartupProbeResult> {
  const provider = getBridgeProvider(selection.mode);
  return await provider.startupProbe(env, bridgeConfig, { strictConfig: true });
}

export interface BridgeAutoDetectAttempt {
  mode: BridgeMode;
  available: boolean;
  detail: string;
  success: boolean;
  detailLines?: string[];
  error?: string;
}

export interface BridgeAutoDetectResult {
  attempts: BridgeAutoDetectAttempt[];
  selected: {
    mode: BridgeMode;
    source: "auto";
    detail: string;
    detailLines: string[];
    configPatch: Partial<BridgeConfig>;
  };
}

export async function autoDetectBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): Promise<BridgeAutoDetectResult> {
  const attempts: BridgeAutoDetectAttempt[] = [];

  for (const provider of BRIDGE_PROVIDERS) {
    const providerConfig =
      provider.mode === "openclaw"
        ? bridgeConfig
          ? { ...bridgeConfig, bridgeCwd: undefined }
          : { bridgeCwd: undefined }
        : bridgeConfig;
    const detection = provider.detect(env, providerConfig);
    if (!detection.available) {
      attempts.push({
        mode: provider.mode,
        available: false,
        detail: detection.detail,
        success: false,
      });
      continue;
    }

    try {
      const probe = await provider.startupProbe(env, providerConfig, { strictConfig: false });
      attempts.push({
        mode: provider.mode,
        available: true,
        detail: detection.detail,
        success: true,
        detailLines: probe.detailLines,
      });
      return {
        attempts,
        selected: {
          mode: provider.mode,
          source: "auto",
          detail: detection.detail,
          detailLines: probe.detailLines,
          configPatch: probe.configPatch ?? { mode: provider.mode },
        },
      };
    } catch (error) {
      attempts.push({
        mode: provider.mode,
        available: true,
        detail: detection.detail,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(
    [
      "No working bridge configuration detected.",
      ...attempts.map((attempt) =>
        attempt.available
          ? `- ${attempt.mode}: ${attempt.success ? "ok" : attempt.error || attempt.detail}`
          : `- ${attempt.mode}: ${attempt.detail}`,
      ),
    ].join("\n"),
  );
}
