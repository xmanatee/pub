import type { ClaudeBridgeSettings } from "../../../../core/config/index.js";

const CLAUDE_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

type ClaudeSdk = typeof import("@anthropic-ai/claude-agent-sdk");

export async function loadClaudeSdk(): Promise<ClaudeSdk | null> {
  try {
    return await import(CLAUDE_SDK_PACKAGE);
  } catch {
    return null;
  }
}

export async function isClaudeSdkImportable(): Promise<boolean> {
  return (await loadClaudeSdk()) !== null;
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

export function buildSdkSessionOptionsFromSettings(
  bridgeSettings: ClaudeBridgeSettings,
  baseEnv: NodeJS.ProcessEnv = process.env,
) {
  return {
    model: bridgeSettings.claudeCodeModel?.trim() || "claude-sonnet-4-6",
    claudePath: bridgeSettings.claudeCodePath,
    allowedTools: parseAllowedTools(bridgeSettings.claudeCodeAllowedTools),
    sdkEnv: buildSdkEnv(baseEnv),
  };
}

export function buildAppendSystemPromptFromSettings(
  bridgeSystemPrompt: string | null,
  bridgeSettings: ClaudeBridgeSettings,
): string | undefined {
  const effective = [bridgeSystemPrompt, bridgeSettings.claudeCodeAppendSystemPrompt?.trim()]
    .filter(Boolean)
    .join("\n\n");
  return effective.length > 0 ? effective : undefined;
}
