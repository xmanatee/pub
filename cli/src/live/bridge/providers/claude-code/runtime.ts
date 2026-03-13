import { spawn } from "node:child_process";
import type { LiveModelProfile } from "../../../../../../shared/live-model-profile.js";
import { resolveClaudeLiveModel } from "../claude-live-model.js";

interface ClaudeArgsSettings {
  claudeCodeMaxTurns?: number;
  liveModelProfile?: LiveModelProfile;
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

export function buildClaudeArgsFromSettings(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
  bridgeSettings: ClaudeArgsSettings,
  opts?: { maxTurns?: number; model?: string },
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
  if (systemPrompt) args.push("--append-system-prompt", systemPrompt);
  const model =
    opts?.model?.trim() ||
    (bridgeSettings.liveModelProfile
      ? resolveClaudeLiveModel(bridgeSettings.liveModelProfile)
      : undefined);
  if (model) args.push("--model", model);
  const maxTurns = opts?.maxTurns ?? bridgeSettings.claudeCodeMaxTurns;
  if (maxTurns !== undefined) args.push("--max-turns", String(maxTurns));
  return args;
}
