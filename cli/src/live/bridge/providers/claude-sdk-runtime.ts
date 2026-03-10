import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { errorMessage } from "../../../core/errors/cli-error.js";
import type { BridgeConfig, PreparedBridgeConfig, PreparedClaudeBridgeConfig } from "../../../core/config/index.js";
import { isClaudeCodeAvailableInEnv, resolveClaudeCodePath } from "./claude-code-runtime.js";
import { runAgentWritePongProbe } from "../../runtime/bridge-write-probe.js";

const require = createRequire(import.meta.url);
const CLAUDE_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

type ClaudeSdk = typeof import("@anthropic-ai/claude-agent-sdk");

export async function loadClaudeSdk(): Promise<ClaudeSdk | null> {
  try {
    return await import(CLAUDE_SDK_PACKAGE);
  } catch {
    return null;
  }
}

function isClaudeSdkResolvable(): boolean {
  try {
    require.resolve(CLAUDE_SDK_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

export function isClaudeSdkAvailableInEnv(
  env: NodeJS.ProcessEnv,
  bridgeConfig?: BridgeConfig,
): boolean {
  return isClaudeCodeAvailableInEnv(env, bridgeConfig) && isClaudeSdkResolvable();
}

export async function isClaudeSdkImportable(): Promise<boolean> {
  return (await loadClaudeSdk()) !== null;
}

export function buildSdkSessionOptions(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
) {
  const model =
    bridgeConfig !== undefined
      ? bridgeConfig.claudeCodeModel || "claude-sonnet-4-6"
      : env.CLAUDE_CODE_MODEL?.trim() || "claude-sonnet-4-6";
  const claudePath = resolveClaudeCodePath(env, bridgeConfig);

  const allowedToolsRaw =
    bridgeConfig !== undefined
      ? bridgeConfig.claudeCodeAllowedTools
      : env.CLAUDE_CODE_ALLOWED_TOOLS?.trim();
  const allowedTools = allowedToolsRaw
    ? allowedToolsRaw
        .split(",")
        .map((tool) => tool.trim())
        .filter(Boolean)
    : undefined;

  const sdkEnv: Record<string, string | undefined> = { ...env };
  delete sdkEnv.CLAUDECODE;

  return { model, claudePath, allowedTools, sdkEnv };
}

function getAutoDetectClaudeSdkCwd(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string {
  return bridgeConfig?.bridgeCwd?.trim() || env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}

function getStrictClaudeSdkCwd(bridgeConfig: PreparedClaudeBridgeConfig): string {
  return bridgeConfig.bridgeCwd;
}

function getStrictClaudeSdkPath(bridgeConfig: PreparedClaudeBridgeConfig): string {
  return bridgeConfig.claudeCodePath;
}

export function buildAppendSystemPrompt(
  bridgeSystemPrompt: string | null,
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  const userSystemPrompt =
    bridgeConfig !== undefined
      ? bridgeConfig.claudeCodeAppendSystemPrompt
      : env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim();
  const effective = [bridgeSystemPrompt, userSystemPrompt].filter(Boolean).join("\n\n");
  return effective.length > 0 ? effective : undefined;
}

export async function runClaudeSdkBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig | PreparedBridgeConfig,
  options?: { strictConfig: boolean },
): Promise<{ claudePath: string; cwd?: string }> {
  const strictConfig = options?.strictConfig === true;
  const { model, allowedTools } = buildSdkSessionOptions(env, bridgeConfig);
  const claudePath =
    strictConfig && bridgeConfig
      ? getStrictClaudeSdkPath(bridgeConfig as PreparedClaudeBridgeConfig)
      : resolveClaudeCodePath(env, bridgeConfig);
  const cwd =
    strictConfig && bridgeConfig
      ? getStrictClaudeSdkCwd(bridgeConfig as PreparedClaudeBridgeConfig)
      : getAutoDetectClaudeSdkCwd(env, bridgeConfig);

  const sdk = await loadClaudeSdk();
  if (!sdk) {
    throw new Error(
      "Claude Agent SDK (@anthropic-ai/claude-agent-sdk) is not importable. Install it and retry.",
    );
  }

  await runAgentWritePongProbe({
    label: "Claude SDK",
    baseEnv: env,
    execute: async (probeEnv) => {
      const probeEnvClean: Record<string, string | undefined> = { ...probeEnv };
      delete probeEnvClean.CLAUDECODE;

      const socketPath = probeEnv.PUB_AGENT_SOCKET ?? "";
      const logPath = path.join(os.tmpdir(), "pub-sdk-probe.log");
      const appendLog = (line: string) => {
        try {
          fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
        } catch (error) {
          if (process.env.PUB_DEBUG === "1") {
            console.warn(`Warning: failed to append SDK probe log: ${errorMessage(error)}`);
          }
        }
      };

      appendLog(`probe start socket=${socketPath}`);

      const prompt = [
        "This is a startup connectivity probe.",
        "Run this exact shell command now:",
        `PUB_AGENT_SOCKET=${socketPath} pub write \"pong\"`,
        "Do not explain. Just execute it.",
      ].join("\n");

      const query = sdk.query({
        prompt,
        options: {
          model,
          pathToClaudeCodeExecutable: claudePath,
          env: probeEnvClean,
          allowedTools,
          cwd: cwd || os.tmpdir(),
          maxTurns: 2,
          persistSession: false,
          canUseTool: async (toolName, input) => {
            appendLog(`canUseTool: tool=${toolName}`);
            return { behavior: "allow" as const, updatedInput: input };
          },
        },
      });

      for await (const message of query) {
        appendLog(`msg: type=${message.type} ${JSON.stringify(message).slice(0, 300)}`);
      }

      appendLog("probe stream completed");
    },
  });

  return { claudePath, cwd };
}
