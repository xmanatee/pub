import { spawn } from "node:child_process";
import type { PubBridgeConfig, ClaudeBridgeSettings, BridgeSettings } from "../../../../core/config/index.js";
import { runAgentWritePongProbe } from "../../../runtime/bridge-write-probe.js";
import PROBE_PROMPT from "./prompts/probe.md";
import {
  buildClaudeArgs,
  resolveAutoDetectClaudeWorkspaceDir,
  resolveClaudeCodePath,
} from "./discovery.js";
import {
  buildClaudeArgsFromSettings,
  runClaudeCodePreflight,
} from "./runtime.js";

function getStrictClaudeCodePath(bridgeConfig: ClaudeBridgeSettings): string {
  return bridgeConfig.claudeCodePath;
}

function getStrictClaudeWorkspaceDir(bridgeConfig: ClaudeBridgeSettings): string {
  return bridgeConfig.workspaceDir;
}

async function runClaudeCodeWritePongProbe(
  claudePath: string,
  envInput: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
  options?: { strictConfig: boolean },
): Promise<void> {
  await runAgentWritePongProbe({
    label: "Claude Code",
    baseEnv: envInput,
    execute: async (probeEnv, signal) => {
      const env = { ...probeEnv };
      delete env.CLAUDECODE;
      const socketPath = probeEnv.PUB_AGENT_SOCKET ?? "";
      const prompt = PROBE_PROMPT.replace("${socketPath}", socketPath).trimEnd();
      const args =
        options?.strictConfig && bridgeConfig
          ? buildClaudeArgsFromSettings(
              prompt,
              null,
              bridgeConfig as ClaudeBridgeSettings,
            )
          : buildClaudeArgs(prompt, null, env, undefined, bridgeConfig);
      if (!args.includes("--max-turns")) args.push("--max-turns", "2");

      const cwd = options?.strictConfig
        ? getStrictClaudeWorkspaceDir(bridgeConfig as ClaudeBridgeSettings)
        : resolveAutoDetectClaudeWorkspaceDir(env);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(claudePath, args, {
          cwd,
          env,
          signal,
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

interface ClaudeCodeRuntimeResolution {
  claudePath: string;
  cwd?: string;
}

export async function runClaudeCodeBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  options?: { strictConfig: boolean },
): Promise<ClaudeCodeRuntimeResolution> {
  const strictConfig = options?.strictConfig === true;
  const claudePath =
    strictConfig && bridgeConfig
      ? getStrictClaudeCodePath(bridgeConfig as ClaudeBridgeSettings)
      : resolveClaudeCodePath(env, bridgeConfig);
  const cwd =
    strictConfig && bridgeConfig
      ? getStrictClaudeWorkspaceDir(bridgeConfig as ClaudeBridgeSettings)
      : resolveAutoDetectClaudeWorkspaceDir(env);
  await runClaudeCodePreflight(claudePath, env);
  await runClaudeCodeWritePongProbe(claudePath, env, bridgeConfig, { strictConfig });
  return { claudePath, cwd };
}
