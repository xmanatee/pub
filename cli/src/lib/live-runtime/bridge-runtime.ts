import { homedir } from "node:os";
import { failCli } from "../cli-error.js";
import type { BridgeConfig } from "../config.js";
import { isClaudeCodeAvailable } from "../live-bridge-claude-code.js";
import { isOpenClawAvailable } from "../live-bridge-openclaw.js";
import type { BridgeMode } from "../live-daemon-shared.js";

export function buildBridgeProcessEnv(bridgeConfig?: BridgeConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  const setIfMissing = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined) return;
    const current = env[key];
    if (typeof current === "string" && current.length > 0) return;
    env[key] = String(value);
  };

  setIfMissing("PUBBLUE_PROJECT_ROOT", process.cwd());
  setIfMissing("OPENCLAW_HOME", homedir());

  if (!bridgeConfig) return env;

  setIfMissing("OPENCLAW_PATH", bridgeConfig.openclawPath);
  setIfMissing("OPENCLAW_STATE_DIR", bridgeConfig.openclawStateDir);
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
  return env;
}

export async function ensureNodeDatachannelAvailable(): Promise<void> {
  try {
    await import("node-datachannel");
  } catch (error) {
    failCli(
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

export function resolveBridgeMode(opts: { bridge?: string }): BridgeMode {
  if (opts.bridge) return parseBridgeMode(opts.bridge);
  return autoDetectBridgeMode();
}

export function autoDetectBridgeMode(): BridgeMode {
  const openclaw = isOpenClawAvailable();
  const claudeCode = isClaudeCodeAvailable();

  if (openclaw && !claudeCode) return "openclaw";
  if (claudeCode && !openclaw) return "claude-code";

  if (openclaw && claudeCode) {
    throw new Error("Both openclaw and claude-code bridges detected. Specify --bridge explicitly.");
  }
  throw new Error(
    "No bridge detected. Install openclaw or claude-code, or specify --bridge explicitly.",
  );
}
