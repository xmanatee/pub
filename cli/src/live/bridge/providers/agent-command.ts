import { spawn } from "node:child_process";
import type { BridgeSettings } from "../../../core/config/index.js";
import { executeProcessCommand } from "../../command/executors/process.js";
import { buildClaudeArgsFromSettings } from "./claude-code/index.js";

export type AgentCommandProvider = "claude-code" | "openclaw";

function readClaudeAssistantOutput(line: string): string | null {
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
    return null;
  }
}

function getClaudeCommandRuntime(bridgeSettings: BridgeSettings): {
  bridgeCwd: string;
  claudeCodeMaxTurns?: number;
  claudePath: string;
} {
  const claudePath = bridgeSettings.claudeCodePath?.trim();
  if (!claudePath) {
    throw new Error(
      "Claude runtime is not configured for canvas agent commands. Set `claude-code.path` or `CLAUDE_CODE_PATH`.",
    );
  }

  return {
    claudePath,
    bridgeCwd: bridgeSettings.bridgeCwd,
    claudeCodeMaxTurns: bridgeSettings.claudeCodeMaxTurns,
  };
}

function getOpenClawCommandRuntime(bridgeSettings: BridgeSettings): {
  bridgeCwd: string;
  openclawPath: string;
  sessionId: string;
} {
  const openclawPath = bridgeSettings.openclawPath?.trim();
  const sessionId = bridgeSettings.sessionId?.trim();
  if (!openclawPath || !sessionId) {
    throw new Error(
      "OpenClaw runtime is not configured for canvas agent commands. Set `openclaw.path` and `openclaw.sessionId`, or the matching environment variables.",
    );
  }

  return {
    openclawPath,
    sessionId,
    bridgeCwd: bridgeSettings.bridgeCwd,
  };
}

function hasClaudeCommandRuntime(bridgeSettings: BridgeSettings): boolean {
  return Boolean(bridgeSettings.claudeCodePath?.trim());
}

function hasOpenClawCommandRuntime(bridgeSettings: BridgeSettings): boolean {
  return Boolean(bridgeSettings.openclawPath?.trim() && bridgeSettings.sessionId?.trim());
}

export function resolveAgentCommandProvider(params: {
  bridgeSettings: BridgeSettings;
  provider?: AgentCommandProvider | "auto";
}): AgentCommandProvider {
  const requested = params.provider;
  if (requested === "claude-code") {
    getClaudeCommandRuntime(params.bridgeSettings);
    return "claude-code";
  }
  if (requested === "openclaw") {
    getOpenClawCommandRuntime(params.bridgeSettings);
    return "openclaw";
  }

  if (
    params.bridgeSettings.mode === "openclaw" &&
    hasOpenClawCommandRuntime(params.bridgeSettings)
  ) {
    return "openclaw";
  }
  if (hasClaudeCommandRuntime(params.bridgeSettings)) {
    return "claude-code";
  }
  if (hasOpenClawCommandRuntime(params.bridgeSettings)) {
    return "openclaw";
  }

  throw new Error(
    "No local agent runtime is configured for canvas agent commands. Configure `claude-code.path` or `openclaw.path` + `openclaw.sessionId`.",
  );
}

async function executeClaudeAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeSettings: BridgeSettings;
}): Promise<unknown> {
  const runtime = getClaudeCommandRuntime(params.bridgeSettings);
  const args = buildClaudeArgsFromSettings(params.prompt, null, null, runtime);
  if (!args.includes("--max-turns")) {
    args.push("--max-turns", "4");
  }

  const outputText = await new Promise<string>((resolve, reject) => {
    const child = spawn(runtime.claudePath, args, {
      cwd: runtime.bridgeCwd,
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
      let sawMalformedStructuredOutput = false;
      const chunks = lines.flatMap((line) => {
        const extracted = readClaudeAssistantOutput(line);
        if (extracted === null) {
          sawMalformedStructuredOutput = true;
          return [];
        }
        return extracted.length > 0 ? [extracted] : [];
      });
      const joined = chunks.join("").trim();
      finish(() =>
        resolve(sawMalformedStructuredOutput || joined.length === 0 ? stdout.trim() : joined),
      );
    });
  });

  if (params.output === "json") {
    const trimmed = outputText.trim();
    if (trimmed.length === 0) return {};
    return JSON.parse(trimmed) as unknown;
  }
  return outputText;
}

async function executeOpenClawAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeSettings: BridgeSettings;
}): Promise<unknown> {
  const runtime = getOpenClawCommandRuntime(params.bridgeSettings);
  const invocationArgs = [
    "agent",
    "--local",
    "--session-id",
    runtime.sessionId,
    "-m",
    params.prompt,
  ];
  const command = runtime.openclawPath.endsWith(".js") ? process.execPath : runtime.openclawPath;
  const args = runtime.openclawPath.endsWith(".js")
    ? [runtime.openclawPath, ...invocationArgs]
    : invocationArgs;
  const result = await executeProcessCommand({
    command,
    args,
    cwd: runtime.bridgeCwd,
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

export async function executeAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeSettings: BridgeSettings;
  provider?: AgentCommandProvider | "auto";
}): Promise<unknown> {
  const provider = resolveAgentCommandProvider({
    bridgeSettings: params.bridgeSettings,
    provider: params.provider,
  });

  if (provider === "openclaw") {
    return executeOpenClawAgentCommand(params);
  }

  return executeClaudeAgentCommand(params);
}
