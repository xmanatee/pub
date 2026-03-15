import type { BridgeSettings, PubBridgeConfig } from "../../../core/config/index.js";
import type { BridgeRunner, BridgeRunnerConfig } from "../shared.js";
import {
  createClaudeCodeBridgeRunner,
  isClaudeCodeAvailableInEnv,
  runClaudeCodeBridgeStartupProbe,
} from "./claude-code/index.js";
import { createClaudeSdkBridgeRunner, runClaudeSdkBridgeStartupProbe } from "./claude-sdk/index.js";
import {
  createOpenClawBridgeRunner,
  isOpenClawAvailable,
  runOpenClawBridgeStartupProbe,
} from "./openclaw/index.js";
import {
  createOpenClawLikeBridgeRunner,
  runOpenClawLikeBridgeStartupProbe,
} from "./openclaw-like/index.js";
import type { BridgeMode } from "./types.js";

interface BridgeProvider {
  mode: BridgeMode;
  priority: number;
  detect(
    env: NodeJS.ProcessEnv,
    bridgeConfig?: PubBridgeConfig,
  ): { available: boolean; detail: string };
  startupProbe(
    env: NodeJS.ProcessEnv,
    bridgeConfig: PubBridgeConfig | BridgeSettings | undefined,
    options: { strictConfig: boolean },
  ): Promise<BridgeStartupProbeResult>;
  createRunner(config: BridgeRunnerConfig, abortSignal?: AbortSignal): Promise<BridgeRunner>;
  prepareAutoDetectConfig?(bridgeConfig?: PubBridgeConfig): PubBridgeConfig | undefined;
}

export interface BridgeStartupProbeResult {
  detailLines: string[];
  configPatch?: Partial<PubBridgeConfig>;
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
    configPatch: Partial<PubBridgeConfig>;
  };
}

function describeConfiguredPath(key: string, env: NodeJS.ProcessEnv): string {
  const configured = env[key]?.trim();
  return configured ? `${key}=${configured}` : `${key} not set`;
}

function configuredPositiveInteger(
  envKey: string,
  env: NodeJS.ProcessEnv,
  value: number | undefined,
): number | undefined {
  const raw = env[envKey]?.trim();
  if (!raw) return value;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value for ${envKey}: ${env[envKey]}`);
  }
  return parsed;
}

const BRIDGE_PROVIDERS: BridgeProvider[] = [
  {
    mode: "openclaw" as const,
    priority: 100,
    detect(env: NodeJS.ProcessEnv, bridgeConfig?: PubBridgeConfig) {
      const available = isOpenClawAvailable(env, bridgeConfig);
      return {
        available,
        detail: `${available ? "OpenClaw runtime detected" : "OpenClaw runtime not detected"} (${describeConfiguredPath("OPENCLAW_PATH", env)})`,
      };
    },
    async startupProbe(
      env: NodeJS.ProcessEnv,
      bridgeConfig: PubBridgeConfig | BridgeSettings | undefined,
      options: { strictConfig: boolean },
    ) {
      const runtime = await runOpenClawBridgeStartupProbe(env, bridgeConfig, options);
      return {
        detailLines: [
          `OpenClaw executable: ${runtime.openclawPath}`,
          `OpenClaw session: ${runtime.sessionId}`,
          "OpenClaw ping/pong: OK",
        ],
        configPatch: {
          mode: "openclaw" as const,
          openclawPath: runtime.openclawPath,
          openclawStateDir: env.OPENCLAW_STATE_DIR?.trim() || bridgeConfig?.openclawStateDir,
          sessionId: runtime.sessionId,
          bridgeCwd: env.OPENCLAW_WORKSPACE?.trim(),
        },
      };
    },
    createRunner: createOpenClawBridgeRunner,
    prepareAutoDetectConfig(bridgeConfig?: PubBridgeConfig) {
      return bridgeConfig ? { ...bridgeConfig, bridgeCwd: undefined } : { bridgeCwd: undefined };
    },
  },
  {
    mode: "claude-sdk" as const,
    priority: 75,
    detect(env: NodeJS.ProcessEnv, bridgeConfig?: PubBridgeConfig) {
      if (!isClaudeCodeAvailableInEnv(env, bridgeConfig)) {
        return {
          available: false,
          detail: `Claude CLI not detected (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
        };
      }
      return {
        available: true,
        detail: `Claude CLI detected, SDK bundled (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
      };
    },
    async startupProbe(
      env: NodeJS.ProcessEnv,
      bridgeConfig: PubBridgeConfig | BridgeSettings | undefined,
      options: { strictConfig: boolean },
    ) {
      const runtime = await runClaudeSdkBridgeStartupProbe(env, bridgeConfig, options);
      const cwd = runtime.cwd || env.PUB_PROJECT_ROOT || process.cwd();
      return {
        detailLines: [
          `Claude executable: ${runtime.claudePath}`,
          "Claude SDK: available",
          `Claude cwd: ${cwd}`,
          'Claude SDK communication via `pub write "pong"`: OK',
        ],
        configPatch: {
          mode: "claude-sdk" as const,
          claudeCodePath: runtime.claudePath,
          claudeCodeMaxTurns: configuredPositiveInteger(
            "CLAUDE_CODE_MAX_TURNS",
            env,
            bridgeConfig?.claudeCodeMaxTurns,
          ),
          bridgeCwd: runtime.cwd,
        },
      };
    },
    createRunner: createClaudeSdkBridgeRunner,
  },
  {
    mode: "claude-code" as const,
    priority: 50,
    detect(env: NodeJS.ProcessEnv, bridgeConfig?: PubBridgeConfig) {
      const available = isClaudeCodeAvailableInEnv(env, bridgeConfig);
      return {
        available,
        detail: `${available ? "Claude Code runtime detected" : "Claude Code runtime not detected"} (${describeConfiguredPath("CLAUDE_CODE_PATH", env)})`,
      };
    },
    async startupProbe(
      env: NodeJS.ProcessEnv,
      bridgeConfig: PubBridgeConfig | BridgeSettings | undefined,
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
          claudeCodeMaxTurns: configuredPositiveInteger(
            "CLAUDE_CODE_MAX_TURNS",
            env,
            bridgeConfig?.claudeCodeMaxTurns,
          ),
          bridgeCwd: runtime.cwd,
        },
      };
    },
    createRunner: createClaudeCodeBridgeRunner,
  },
  {
    mode: "openclaw-like" as const,
    priority: 0,
    detect() {
      return { available: false, detail: "openclaw-like is manual-config only" };
    },
    async startupProbe(
      env: NodeJS.ProcessEnv,
      bridgeConfig: PubBridgeConfig | BridgeSettings | undefined,
      options: { strictConfig: boolean },
    ) {
      const runtime = await runOpenClawLikeBridgeStartupProbe(env, bridgeConfig, options);
      return {
        detailLines: [
          `openclaw-like command: ${runtime.command}`,
          `openclaw-like cwd: ${runtime.cwd}`,
          'openclaw-like communication via `pub write "pong"`: OK',
        ],
      };
    },
    createRunner: createOpenClawLikeBridgeRunner,
  },
].sort((a, b) => b.priority - a.priority);

export function getBridgeProvider(mode: BridgeMode): BridgeProvider {
  const provider = BRIDGE_PROVIDERS.find((entry) => entry.mode === mode);
  if (!provider) {
    throw new Error(`Unsupported bridge provider: ${mode}`);
  }
  return provider;
}

export async function createBridgeRunnerForSettings(params: {
  bridgeSettings: BridgeSettings;
  config: BridgeRunnerConfig;
  abortSignal?: AbortSignal;
}): Promise<BridgeRunner> {
  return getBridgeProvider(params.bridgeSettings.mode).createRunner(
    params.config,
    params.abortSignal,
  );
}

export async function runBridgeStartupPreflight(
  mode: BridgeMode,
  env: NodeJS.ProcessEnv = process.env,
  bridgeSettings: BridgeSettings,
): Promise<BridgeStartupProbeResult> {
  return getBridgeProvider(mode).startupProbe(env, bridgeSettings, {
    strictConfig: true,
  });
}

export async function autoDetectBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): Promise<BridgeAutoDetectResult> {
  const attempts: BridgeAutoDetectAttempt[] = [];

  for (const provider of BRIDGE_PROVIDERS) {
    const providerConfig = provider.prepareAutoDetectConfig
      ? provider.prepareAutoDetectConfig(bridgeConfig)
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
      "No working bridge runtime was detected.",
      ...attempts.map(
        (attempt) =>
          `${attempt.mode}: ${attempt.available ? attempt.error || attempt.detail : attempt.detail}`,
      ),
      "Configure one manually with `pub config --set bridge.mode=...` or install a supported runtime.",
    ].join("\n"),
  );
}
