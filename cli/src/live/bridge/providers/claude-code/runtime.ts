import { spawn } from "node:child_process";
import type { ClaudeBridgeSettings } from "../../../../core/config/index.js";

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

interface ClaudeArgsOptions {
  model?: string;
  allowedTools?: string;
  appendSystemPrompt?: string;
  maxTurns?: number;
}

function buildClaudeArgsWithOptions(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
  options: ClaudeArgsOptions,
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
  if (options.model) args.push("--model", options.model);
  if (options.allowedTools) args.push("--allowedTools", options.allowedTools);

  const effectiveSystemPrompt = [systemPrompt, options.appendSystemPrompt]
    .filter(Boolean)
    .join("\n\n");
  if (effectiveSystemPrompt) args.push("--append-system-prompt", effectiveSystemPrompt);
  if (options.maxTurns !== undefined) args.push("--max-turns", String(options.maxTurns));
  return args;
}

export function buildClaudeArgsFromSettings(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
  bridgeSettings: ClaudeBridgeSettings,
  opts?: { maxTurns?: number },
): string[] {
  return buildClaudeArgsWithOptions(prompt, sessionId, systemPrompt, {
    model: bridgeSettings.claudeCodeModel?.trim(),
    allowedTools: bridgeSettings.claudeCodeAllowedTools?.trim(),
    appendSystemPrompt: bridgeSettings.claudeCodeAppendSystemPrompt?.trim(),
    maxTurns: opts?.maxTurns ?? bridgeSettings.claudeCodeMaxTurns,
  });
}
