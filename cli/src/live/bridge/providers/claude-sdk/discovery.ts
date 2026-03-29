import type { PubBridgeConfig } from "../../../../core/config/index.js";
import {
  isClaudeCodeAvailableInEnv,
  resolveClaudeCodePath,
} from "../claude-code/discovery.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

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
    model: DEFAULT_MODEL,
    claudePath: resolveClaudeCodePath(env, bridgeConfig),
    sdkEnv: buildSdkEnv(env),
  };
}

export function resolveAutoDetectClaudeSdkWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}
