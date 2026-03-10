import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { BridgeConfig, PreparedClaudeBridgeConfig, PreparedBridgeConfig } from "../../../core/config/index.js";
import { resolveCommandFromPath } from "./command-path.js";
import { runAgentWritePongProbe } from "../../runtime/bridge-write-probe.js";

function getConfiguredClaudeCodePath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodePath;
  return env.CLAUDE_CODE_PATH?.trim();
}

function getConfiguredClaudeCodeModel(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodeModel;
  return env.CLAUDE_CODE_MODEL?.trim();
}

function getConfiguredClaudeCodeAllowedTools(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodeAllowedTools;
  return env.CLAUDE_CODE_ALLOWED_TOOLS?.trim();
}

function getConfiguredClaudeCodeAppendPrompt(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodeAppendSystemPrompt;
  return env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim();
}

function getConfiguredClaudeCodeMaxTurns(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) {
    return bridgeConfig.claudeCodeMaxTurns !== undefined
      ? String(bridgeConfig.claudeCodeMaxTurns)
      : undefined;
  }
  return env.CLAUDE_CODE_MAX_TURNS?.trim();
}

export function isClaudeCodeAvailableInEnv(
  env: NodeJS.ProcessEnv,
  bridgeConfig?: BridgeConfig,
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
  bridgeConfig?: BridgeConfig,
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

export async function runClaudeCodePreflight(
  claudePath: string,
  envInput: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const env = { ...envInput };
  delete env.CLAUDECODE;
  return await new Promise((resolve, reject) => {
    const child = spawn(claudePath, ["--version"], { timeout: 10_000, stdio: "pipe", env });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(new Error(`Claude Code preflight failed: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Claude Code preflight failed (exit ${code}): ${stderr.trim()}`));
    });
  });
}

function getAutoDetectClaudeBridgeCwd(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string {
  return bridgeConfig?.bridgeCwd?.trim() || env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}

function getStrictClaudeCodePath(bridgeConfig: PreparedClaudeBridgeConfig): string {
  return bridgeConfig.claudeCodePath;
}

function getStrictClaudeBridgeCwd(bridgeConfig: PreparedClaudeBridgeConfig): string {
  return bridgeConfig.bridgeCwd;
}

export function buildClaudeArgs(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { maxTurns?: number },
  bridgeConfig?: BridgeConfig,
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

  const model = getConfiguredClaudeCodeModel(env, bridgeConfig);
  if (model) args.push("--model", model);

  const allowedTools = getConfiguredClaudeCodeAllowedTools(env, bridgeConfig);
  if (allowedTools) args.push("--allowedTools", allowedTools);

  const userSystemPrompt = getConfiguredClaudeCodeAppendPrompt(env, bridgeConfig);
  const effectiveSystemPrompt = [systemPrompt, userSystemPrompt].filter(Boolean).join("\n\n");
  if (effectiveSystemPrompt) args.push("--append-system-prompt", effectiveSystemPrompt);

  if (opts?.maxTurns !== undefined) {
    args.push("--max-turns", String(opts.maxTurns));
  } else {
    const maxTurns = getConfiguredClaudeCodeMaxTurns(env, bridgeConfig);
    if (maxTurns) args.push("--max-turns", maxTurns);
  }

  return args;
}

async function runClaudeCodeWritePongProbe(
  claudePath: string,
  envInput: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
  options?: { strictConfig: boolean },
): Promise<void> {
  await runAgentWritePongProbe({
    label: "Claude Code",
    baseEnv: envInput,
    execute: async (probeEnv) => {
      const env = { ...probeEnv };
      delete env.CLAUDECODE;
      const prompt = [
        "This is a startup connectivity probe.",
        "Run this exact shell command now:",
        'pub write "pong"',
        "Do not explain. Just execute it.",
      ].join("\n");
      const args = buildClaudeArgs(prompt, null, null, env, undefined, bridgeConfig);
      if (!args.includes("--max-turns")) args.push("--max-turns", "2");

      const cwd = options?.strictConfig
        ? getStrictClaudeBridgeCwd(bridgeConfig as PreparedClaudeBridgeConfig)
        : getAutoDetectClaudeBridgeCwd(env, bridgeConfig);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(claudePath, args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf-8");
        });
        child.on("error", (error) => {
          reject(new Error(`Claude Code ping/pong preflight failed: ${error.message}`));
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(
            new Error(
              stderr.trim().length > 0
                ? `Claude Code ping/pong preflight failed (exit ${code}): ${stderr.trim()}`
                : `Claude Code ping/pong preflight failed (exit ${code})`,
            ),
          );
        });
      });
    },
  });
}

export interface ClaudeCodeRuntimeResolution {
  claudePath: string;
  cwd?: string;
}

export async function runClaudeCodeBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig | PreparedBridgeConfig,
  options?: { strictConfig: boolean },
): Promise<ClaudeCodeRuntimeResolution> {
  const strictConfig = options?.strictConfig === true;
  const claudePath =
    strictConfig && bridgeConfig
      ? getStrictClaudeCodePath(bridgeConfig as PreparedClaudeBridgeConfig)
      : resolveClaudeCodePath(env, bridgeConfig);
  const cwd =
    strictConfig && bridgeConfig
      ? getStrictClaudeBridgeCwd(bridgeConfig as PreparedClaudeBridgeConfig)
      : getAutoDetectClaudeBridgeCwd(env, bridgeConfig);
  await runClaudeCodePreflight(claudePath, env);
  await runClaudeCodeWritePongProbe(claudePath, env, bridgeConfig, { strictConfig });
  return { claudePath, cwd };
}
