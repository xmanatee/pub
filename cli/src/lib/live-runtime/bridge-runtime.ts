import type { BridgeConfig } from "../config.js";
import {
  isClaudeCodeAvailableInEnv,
  runClaudeCodeBridgeStartupProbe,
} from "../live-bridge-claude-code.js";
import { isOpenClawAvailable, runOpenClawBridgeStartupProbe } from "../live-bridge-openclaw.js";
import {
  resolveOpenClawHome,
  resolveOpenClawWorkspaceDir,
} from "../openclaw-paths.js";
import type { BridgeMode } from "../live-daemon-shared.js";

export function buildBridgeProcessEnv(bridgeConfig?: BridgeConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  const setIfMissing = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined) return;
    const current = env[key];
    if (typeof current === "string" && current.length > 0) return;
    env[key] = String(value);
  };

  setIfMissing("OPENCLAW_HOME", resolveOpenClawHome(env));

  if (bridgeConfig) {
    setIfMissing("OPENCLAW_PATH", bridgeConfig.openclawPath);
    setIfMissing("OPENCLAW_STATE_DIR", bridgeConfig.openclawStateDir);
    setIfMissing("OPENCLAW_WORKSPACE", bridgeConfig.openclawWorkspace);
    setIfMissing("OPENCLAW_SESSION_ID", bridgeConfig.sessionId);
    setIfMissing("OPENCLAW_THREAD_ID", bridgeConfig.threadId);
    setIfMissing("OPENCLAW_CANVAS_REMINDER_EVERY", bridgeConfig.canvasReminderEvery);
    setIfMissing(
      "OPENCLAW_DELIVER",
      bridgeConfig.deliver === undefined ? undefined : bridgeConfig.deliver ? "1" : "0",
    );
    setIfMissing("OPENCLAW_DELIVER_CHANNEL", bridgeConfig.deliverChannel);
    setIfMissing("OPENCLAW_REPLY_TO", bridgeConfig.replyTo);
    setIfMissing("OPENCLAW_DELIVER_TIMEOUT_MS", bridgeConfig.deliverTimeoutMs);
    setIfMissing("OPENCLAW_ATTACHMENT_DIR", bridgeConfig.attachmentDir);
    setIfMissing("OPENCLAW_ATTACHMENT_MAX_BYTES", bridgeConfig.attachmentMaxBytes);
    setIfMissing("CLAUDE_CODE_PATH", bridgeConfig.claudeCodePath);
    setIfMissing("CLAUDE_CODE_MODEL", bridgeConfig.claudeCodeModel);
    setIfMissing("CLAUDE_CODE_ALLOWED_TOOLS", bridgeConfig.claudeCodeAllowedTools);
    setIfMissing("CLAUDE_CODE_APPEND_SYSTEM_PROMPT", bridgeConfig.claudeCodeAppendSystemPrompt);
    setIfMissing("CLAUDE_CODE_MAX_TURNS", bridgeConfig.claudeCodeMaxTurns);
    setIfMissing("CLAUDE_CODE_CWD", bridgeConfig.claudeCodeCwd);
    setIfMissing("PUBBLUE_COMMAND_DEFAULT_TIMEOUT_MS", bridgeConfig.commandDefaultTimeoutMs);
    setIfMissing("PUBBLUE_COMMAND_MAX_OUTPUT_BYTES", bridgeConfig.commandMaxOutputBytes);
    setIfMissing("PUBBLUE_COMMAND_MAX_CONCURRENT", bridgeConfig.commandMaxConcurrent);
  }

  setIfMissing("OPENCLAW_WORKSPACE", resolveOpenClawWorkspaceDir(env));
  setIfMissing("PUBBLUE_PROJECT_ROOT", process.cwd());
  return env;
}

export async function ensureNodeDatachannelAvailable(): Promise<void> {
  try {
    await import("node-datachannel");
  } catch (error) {
    throw new Error(
      [
        "node-datachannel native module is not available.",
        "Run `pnpm rebuild node-datachannel` in the cli package and retry.",
        `Details: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

export function parseBridgeMode(raw: string): BridgeMode {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "openclaw" || normalized === "claude-code") {
    return normalized;
  }
  throw new Error(`--bridge must be one of: openclaw, claude-code. Received: ${raw}`);
}

interface BridgeProvider {
  mode: BridgeMode;
  priority: number;
  detect(env: NodeJS.ProcessEnv): { available: boolean; detail: string };
  startupProbe(env: NodeJS.ProcessEnv): Promise<string[]>;
}

function describeConfiguredPath(key: string, env: NodeJS.ProcessEnv): string {
  const configured = env[key]?.trim();
  return configured ? `${key}=${configured}` : `${key} not set`;
}

const BRIDGE_PROVIDERS: BridgeProvider[] = [
  {
    mode: "openclaw" as const,
    priority: 100,
    detect(env: NodeJS.ProcessEnv) {
      const available = isOpenClawAvailable(env);
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
    async startupProbe(env: NodeJS.ProcessEnv) {
      const runtime = await runOpenClawBridgeStartupProbe(env);
      return [
        `OpenClaw executable: ${runtime.openclawPath}`,
        `OpenClaw session: ${runtime.sessionId} (${runtime.sessionSource ?? "unknown"})`,
        'OpenClaw communication via `pubblue write "pong"`: OK',
      ];
    },
  },
  {
    mode: "claude-code" as const,
    priority: 50,
    detect(env: NodeJS.ProcessEnv) {
      const available = isClaudeCodeAvailableInEnv(env);
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
    async startupProbe(env: NodeJS.ProcessEnv) {
      const runtime = await runClaudeCodeBridgeStartupProbe(env);
      const cwd = runtime.cwd || env.PUBBLUE_PROJECT_ROOT || process.cwd();
      return [
        `Claude executable: ${runtime.claudePath}`,
        `Claude cwd: ${cwd}`,
        'Claude communication via `pubblue write "pong"`: OK',
      ];
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
  source: "explicit" | "auto";
  detail: string;
}

export interface BridgeAvailability {
  mode: BridgeMode;
  available: boolean;
  detail: string;
}

export function detectBridgeAvailability(
  env: NodeJS.ProcessEnv = process.env,
): BridgeAvailability[] {
  return BRIDGE_PROVIDERS.map((provider) => {
    const detection = provider.detect(env);
    return {
      mode: provider.mode,
      available: detection.available,
      detail: detection.detail,
    };
  });
}

export function resolveBridgeSelection(
  opts: { bridge?: string },
  env: NodeJS.ProcessEnv = process.env,
): BridgeSelection {
  if (opts.bridge) {
    const mode = parseBridgeMode(opts.bridge);
    const provider = getBridgeProvider(mode);
    const detection = provider.detect(env);
    if (!detection.available) {
      throw new Error(`Requested bridge "${mode}" is unavailable: ${detection.detail}`);
    }
    return {
      mode,
      source: "explicit",
      detail: detection.detail,
    };
  }

  const detections = BRIDGE_PROVIDERS.map((provider) => ({
    provider,
    detection: provider.detect(env),
  }));

  const selected = detections.find((entry) => entry.detection.available);
  if (!selected) {
    const details = detections.map(
      (entry) => `- ${entry.provider.mode}: ${entry.detection.detail}`,
    );
    throw new Error(
      [
        "No bridge detected.",
        "Install/configure OpenClaw or Claude Code and retry.",
        ...details,
      ].join("\n"),
    );
  }

  return {
    mode: selected.provider.mode,
    source: "auto",
    detail: selected.detection.detail,
  };
}

export async function runBridgeStartupPreflight(
  selection: BridgeSelection,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const provider = getBridgeProvider(selection.mode);
  return provider.startupProbe(env);
}

export function resolveBridgeMode(
  opts: { bridge?: string },
  env: NodeJS.ProcessEnv = process.env,
): BridgeMode {
  return resolveBridgeSelection(opts, env).mode;
}

export function autoDetectBridgeMode(env: NodeJS.ProcessEnv = process.env): BridgeMode {
  return resolveBridgeSelection({}, env).mode;
}
