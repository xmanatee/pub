import * as sdk from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeBridgeSettings } from "../../../../core/config/index.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

type ClaudeSdk = typeof import("@anthropic-ai/claude-agent-sdk");

export function loadClaudeSdk(): ClaudeSdk {
  return sdk;
}

function buildSdkEnv(baseEnv: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const sdkEnv: Record<string, string | undefined> = { ...baseEnv };
  delete sdkEnv.CLAUDECODE;
  for (const key of Object.keys(sdkEnv)) {
    if (key.startsWith("PUB_DAEMON_")) delete sdkEnv[key];
  }
  return sdkEnv;
}

export function buildSdkSessionOptionsFromSettings(
  bridgeSettings: ClaudeBridgeSettings,
  baseEnv: NodeJS.ProcessEnv = process.env,
  opts?: { model?: string },
) {
  return {
    model: opts?.model?.trim() || DEFAULT_MODEL,
    claudePath: bridgeSettings.claudeCodePath,
    sdkEnv: buildSdkEnv(baseEnv),
  };
}
