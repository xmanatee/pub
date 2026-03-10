import { spawn } from "node:child_process";
import type { PreparedBridgeConfig } from "../../../core/config/index.js";
import { buildClaudeArgs } from "../../bridge/providers/claude-code.js";
import { executeProcessCommand } from "./process.js";

function readClaudeAssistantOutput(line: string): string {
  if (!line.trim().startsWith("{")) return "";
  try {
    const event = JSON.parse(line) as {
      delta?: { text?: unknown };
      message?: { content?: unknown; role?: unknown };
      text?: unknown;
      type?: unknown;
    };
    if (typeof event.text === "string") return event.text;
    if (event.delta && typeof event.delta.text === "string") return event.delta.text;
    if (
      event.message &&
      event.message.role === "assistant" &&
      typeof event.message.content === "string"
    ) {
      return event.message.content;
    }
    return "";
  } catch {
    return "";
  }
}

export async function executeClaudeAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeConfig: PreparedBridgeConfig;
}): Promise<unknown> {
  if (params.bridgeConfig.mode === "openclaw") {
    throw new Error("Claude runtime is not prepared for command execution.");
  }

  const claudePath = params.bridgeConfig.claudeCodePath;
  const cwd = params.bridgeConfig.bridgeCwd;
  const args = buildClaudeArgs(params.prompt, null, null, process.env, undefined, params.bridgeConfig);
  if (!args.includes("--max-turns")) {
    args.push("--max-turns", "4");
  }

  const outputText = await new Promise<string>((resolve, reject) => {
    const child = spawn(claudePath, args, {
      cwd,
      env: { ...process.env },
      signal: params.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`Agent command timed out after ${params.timeoutMs}ms`)));
    }, params.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
      if (stdout.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stdout exceeded ${params.maxOutputBytes} bytes`)));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stderr exceeded ${params.maxOutputBytes} bytes`)));
      }
    });
    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = stderr.trim().length > 0 ? stderr.trim() : `exit code ${code}`;
        finish(() => reject(new Error(detail)));
        return;
      }
      const lines = stdout.split(/\r?\n/);
      const chunks = lines.map(readClaudeAssistantOutput).filter((entry) => entry.length > 0);
      const joined = chunks.join("").trim();
      finish(() => resolve(joined.length > 0 ? joined : stdout.trim()));
    });
  });

  if (params.output === "json") {
    const trimmed = outputText.trim();
    if (trimmed.length === 0) return {};
    return JSON.parse(trimmed) as unknown;
  }
  return outputText;
}

export async function executeOpenClawAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeConfig: PreparedBridgeConfig;
}): Promise<unknown> {
  if (params.bridgeConfig.mode !== "openclaw") {
    throw new Error("OpenClaw runtime is not prepared for command execution.");
  }

  const openclawPath = params.bridgeConfig.openclawPath;
  const sessionId = params.bridgeConfig.sessionId;
  const cwd = params.bridgeConfig.bridgeCwd;
  const invocationArgs = ["agent", "--local", "--session-id", sessionId, "-m", params.prompt];
  const command = openclawPath.endsWith(".js") ? process.execPath : openclawPath;
  const args = openclawPath.endsWith(".js") ? [openclawPath, ...invocationArgs] : invocationArgs;
  const result = await executeProcessCommand({
    command,
    args,
    cwd,
    timeoutMs: params.timeoutMs,
    maxOutputBytes: params.maxOutputBytes,
    signal: params.signal,
  });

  const output = result.stdout.trim();
  if (params.output === "json") {
    return output.length === 0 ? {} : (JSON.parse(output) as unknown);
  }
  return output;
}
