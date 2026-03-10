import { existsSync } from "node:fs";
import type { PubBridgeConfig } from "../../../../core/config/index.js";
import { resolveCommandFromPath } from "../command-path.js";

function getConfiguredClaudeCodePath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return env.CLAUDE_CODE_PATH?.trim() || bridgeConfig?.claudeCodePath?.trim();
}

function getConfiguredClaudeCodeModel(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return env.CLAUDE_CODE_MODEL?.trim() || bridgeConfig?.claudeCodeModel?.trim();
}

function getConfiguredClaudeCodeAllowedTools(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return env.CLAUDE_CODE_ALLOWED_TOOLS?.trim() || bridgeConfig?.claudeCodeAllowedTools?.trim();
}

function getConfiguredClaudeCodeAppendPrompt(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return (
    env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim() ||
    bridgeConfig?.claudeCodeAppendSystemPrompt?.trim()
  );
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

interface ClaudeArgsOptions {
  model?: string;
  allowedTools?: string;
  appendSystemPrompt?: string;
  maxTurns?: number;
}

function buildClaudeArgsWithOptions(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
  options: ClaudeArgsOptions,
): string[] {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  if (sessionId) args.push("--resume", sessionId);
  if (options.model) args.push("--model", options.model);
  if (options.allowedTools) args.push("--allowedTools", options.allowedTools);

  const effectiveSystemPrompt = [systemPrompt, options.appendSystemPrompt]
    .filter(Boolean)
    .join("\n\n");
  if (effectiveSystemPrompt) args.push("--append-system-prompt", effectiveSystemPrompt);
  if (options.maxTurns !== undefined) args.push("--max-turns", String(options.maxTurns));
  return args;
}

export function buildClaudeArgs(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { maxTurns?: number },
  bridgeConfig?: PubBridgeConfig,
): string[] {
  const configuredMaxTurns = getConfiguredClaudeCodeMaxTurns(env, bridgeConfig);
  return buildClaudeArgsWithOptions(prompt, sessionId, systemPrompt, {
    model: getConfiguredClaudeCodeModel(env, bridgeConfig),
    allowedTools: getConfiguredClaudeCodeAllowedTools(env, bridgeConfig),
    appendSystemPrompt: getConfiguredClaudeCodeAppendPrompt(env, bridgeConfig),
    maxTurns: opts?.maxTurns ?? parseConfiguredMaxTurns(configuredMaxTurns),
  });
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

export function resolveAutoDetectClaudeBridgeCwd(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string {
  return bridgeConfig?.bridgeCwd?.trim() || env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}
