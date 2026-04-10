import { spawn } from "node:child_process";
import type {
  BridgeSettings,
  ClaudeBridgeSettings,
  PubBridgeConfig,
} from "../../../../core/config/index.js";
import { runAgentWritePongProbe } from "../../../runtime/bridge-write-probe.js";
import {
  buildClaudeArgs,
  resolveAutoDetectClaudeWorkspaceDir,
  resolveClaudeCodePath,
} from "./discovery.js";
import PROBE_PROMPT from "./prompts/probe.md";
import { buildClaudeArgsFromSettings, runClaudeCodePreflight } from "./runtime.js";

async function runClaudeCodeWritePongProbe(
  claudePath: string,
  cwd: string,
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
      const prompt = PROBE_PROMPT.replace("{{socketPath}}", socketPath).trimEnd();
      const args =
        options?.strictConfig && bridgeConfig
          ? buildClaudeArgsFromSettings(prompt, null, bridgeConfig as ClaudeBridgeSettings)
          : buildClaudeArgs(prompt, null, env, undefined, bridgeConfig);
      if (!args.includes("--max-turns")) args.push("--max-turns", "2");

      await new Promise<void>((resolve, reject) => {
        const child = spawn(claudePath, args, {
          cwd,
          env,
          signal,
          stdio: ["ignore", "ignore", "pipe"],
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
      ? (bridgeConfig as ClaudeBridgeSettings).claudeCodePath
      : resolveClaudeCodePath(env, bridgeConfig);
  const cwd =
    strictConfig && bridgeConfig
      ? (bridgeConfig as ClaudeBridgeSettings).workspaceDir
      : resolveAutoDetectClaudeWorkspaceDir(env);
  await runClaudeCodePreflight(claudePath, env);
  await runClaudeCodeWritePongProbe(claudePath, cwd, env, bridgeConfig, { strictConfig });
  return { claudePath, cwd };
}
