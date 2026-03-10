import type { PubBridgeConfig } from "../../../../core/config/index.js";
import {
  isClaudeCodeAvailableInEnv,
  resolveClaudeCodePath,
} from "../claude-code/discovery.js";

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
  for (const key of Object.keys(sdkEnv)) {
    if (key.startsWith("PUB_DAEMON_")) delete sdkEnv[key];
  }
  return sdkEnv;
}

export function isClaudeSdkAvailableInEnv(
  env: NodeJS.ProcessEnv,
  bridgeConfig?: PubBridgeConfig,
): boolean {
  return isClaudeCodeAvailableInEnv(env, bridgeConfig);
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

export function resolveAutoDetectClaudeSdkCwd(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string {
  return bridgeConfig?.bridgeCwd?.trim() || env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}
