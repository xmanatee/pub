import { existsSync } from "node:fs";
import type { PubBridgeConfig } from "../../../../core/config/index.js";
import { resolveCommandFromPath } from "../command-path.js";
import { shouldSkipClaudePermissionsPrompt } from "./permissions.js";

function getConfiguredClaudeCodePath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return env.CLAUDE_CODE_PATH?.trim() || bridgeConfig?.claudeCodePath?.trim();
}

function getConfiguredClaudeCodeMaxTurns(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return (
    env.CLAUDE_CODE_MAX_TURNS?.trim() ||
    (bridgeConfig?.claudeCodeMaxTurns !== undefined
      ? String(bridgeConfig.claudeCodeMaxTurns)
      : undefined)
  );
}

function parseConfiguredMaxTurns(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildClaudeArgs(
  prompt: string,
  sessionId: string | null,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { maxTurns?: number },
  bridgeConfig?: PubBridgeConfig,
): string[] {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
  if (shouldSkipClaudePermissionsPrompt()) {
    args.push("--dangerously-skip-permissions");
  }
  if (sessionId) args.push("--resume", sessionId);
  const configuredMaxTurns = getConfiguredClaudeCodeMaxTurns(env, bridgeConfig);
  const maxTurns = opts?.maxTurns ?? parseConfiguredMaxTurns(configuredMaxTurns);
  if (maxTurns !== undefined) args.push("--max-turns", String(maxTurns));
  return args;
}

export function isClaudeCodeAvailableInEnv(
  env: NodeJS.ProcessEnv,
  bridgeConfig?: PubBridgeConfig,
): boolean {
  const configured = getConfiguredClaudeCodePath(env, bridgeConfig);
  if (configured) {
    if (existsSync(configured)) return true;
    return resolveCommandFromPath(configured) !== null;
  }
  return resolveCommandFromPath("claude") !== null;
}

export function resolveClaudeCodePath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string {
  const configured = getConfiguredClaudeCodePath(env, bridgeConfig);
  if (configured) {
    if (existsSync(configured)) return configured;
    const resolvedConfigured = resolveCommandFromPath(configured);
    if (resolvedConfigured) return resolvedConfigured;
    return configured;
  }
  const pathFromShell = resolveCommandFromPath("claude");
  if (pathFromShell) return pathFromShell;
  return "claude";
}

export function resolveAutoDetectClaudeWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}
