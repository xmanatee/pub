import type { PubBridgeConfig, BridgeSettings } from "../../core/config/index.js";
import {
  isClaudeCodeAvailableInEnv,
  runClaudeCodeBridgeStartupProbe,
} from "../bridge/providers/claude-code/index.js";
import {
  runClaudeSdkBridgeStartupProbe,
} from "../bridge/providers/claude-sdk/index.js";
import {
  isOpenClawAvailable,
  runOpenClawBridgeStartupProbe,
} from "../bridge/providers/openclaw/index.js";
import type { BridgeMode } from "../daemon/shared.js";

interface BridgeProvider {
  mode: BridgeMode;
  priority: number;
  detect(env: NodeJS.ProcessEnv, bridgeConfig?: PubBridgeConfig): { available: boolean; detail: string };
  startupProbe(
    env: NodeJS.ProcessEnv,
    bridgeConfig: PubBridgeConfig | BridgeSettings | undefined,
    options: { strictConfig: boolean },
  ): Promise<BridgeStartupProbeResult>;
}

export interface BridgeStartupProbeResult {
  detailLines: string[];
  configPatch?: Partial<PubBridgeConfig>;
}

function describeConfiguredPath(key: string, env: NodeJS.ProcessEnv): string {
  const configured = env[key]?.trim();
  return configured ? `${key}=${configured}` : `${key} not set`;
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
          `Claude SDK: available`,
          `Claude cwd: ${cwd}`,
          'Claude SDK communication via `pub write "pong"`: OK',
        ],
        configPatch: {
          mode: "claude-sdk" as const,
          claudeCodePath: runtime.claudePath,
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

export async function runBridgeStartupPreflight(
  mode: BridgeMode,
  env: NodeJS.ProcessEnv = process.env,
  bridgeSettings: BridgeSettings,
): Promise<BridgeStartupProbeResult> {
  return await getBridgeProvider(mode).startupProbe(env, bridgeSettings, {
    strictConfig: true,
  });
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

export async function autoDetectBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
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
