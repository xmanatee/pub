import { createRequire } from "node:module";
import type { PubBridgeConfig } from "../../../../core/config/index.js";
import {
  isClaudeCodeAvailableInEnv,
  resolveClaudeCodePath,
} from "../claude-code/discovery.js";

const require = createRequire(import.meta.url);
const CLAUDE_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

function isClaudeSdkResolvable(): boolean {
  try {
    require.resolve(CLAUDE_SDK_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

function parseAllowedTools(raw: string | undefined): string[] | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function buildSdkEnv(baseEnv: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const sdkEnv: Record<string, string | undefined> = { ...baseEnv };
  delete sdkEnv.CLAUDECODE;
  return sdkEnv;
}

export function isClaudeSdkAvailableInEnv(
  env: NodeJS.ProcessEnv,
  bridgeConfig?: PubBridgeConfig,
): boolean {
  return isClaudeCodeAvailableInEnv(env, bridgeConfig) && isClaudeSdkResolvable();
}

export function buildSdkSessionOptions(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
) {
  return {
    model: env.CLAUDE_CODE_MODEL?.trim() || bridgeConfig?.claudeCodeModel || "claude-sonnet-4-6",
    claudePath: resolveClaudeCodePath(env, bridgeConfig),
    allowedTools: parseAllowedTools(
      env.CLAUDE_CODE_ALLOWED_TOOLS?.trim() || bridgeConfig?.claudeCodeAllowedTools?.trim(),
    ),
    sdkEnv: buildSdkEnv(env),
  };
}

export function buildAppendSystemPrompt(
  bridgeSystemPrompt: string | null,
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  const userSystemPrompt =
    env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim() ||
    bridgeConfig?.claudeCodeAppendSystemPrompt?.trim();
  const effective = [bridgeSystemPrompt, userSystemPrompt].filter(Boolean).join("\n\n");
  return effective.length > 0 ? effective : undefined;
}

export function resolveAutoDetectClaudeSdkCwd(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string {
  return bridgeConfig?.bridgeCwd?.trim() || env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}
