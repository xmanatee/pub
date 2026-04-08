import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { type ActiveStream, ensureDirectoryWritable } from "../../attachments.js";
import { createEntryHandler, createErrorChatSender } from "../../entry-handler.js";
import { createBridgeEntryQueue } from "../../queue.js";
import type {
  BridgeCapabilities,
  BridgeRunner,
  BridgeRunnerConfig,
  BridgeStatus,
} from "../../shared.js";
import { buildClaudeArgsFromSettings, runClaudeCodePreflight } from "./runtime.js";

export {
  buildClaudeArgs,
  isClaudeCodeAvailableInEnv,
  resolveClaudeCodePath,
} from "./discovery.js";
export { runClaudeCodeBridgeStartupProbe } from "./probe.js";
export { buildClaudeArgsFromSettings } from "./runtime.js";

const SESSION_BRIEFING_MAX_TURNS = 2;

const CAPABILITIES: BridgeCapabilities = { conversational: true };

export type ClaudeExitContext = {
  exitCode: number;
  terminalReason: string | null;
  capturedSessionId: string | null;
  stderr: string;
};

/**
 * Evaluates whether a non-zero Claude Code exit is fatal.
 * Returns an error message to throw, or null if the exit is non-fatal.
 *
 * `max_turns` with a captured session is non-fatal: the session was
 * established and subsequent prompts can resume it.
 */
export function evaluateClaudeExit(ctx: ClaudeExitContext): string | null {
  if (ctx.terminalReason === "max_turns" && ctx.capturedSessionId) {
    return null;
  }
  return ctx.stderr || `exit code ${ctx.exitCode}`;
}

export async function createClaudeCodeBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "claude-code") {
    throw new Error("Claude Code runtime is not prepared.");
  }
  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;

  const claudePath = bridgeSettings.claudeCodePath;
  const cwd = bridgeSettings.workspaceDir;
  const activeStreams = new Map<string, ActiveStream>();

  ensureDirectoryWritable(bridgeSettings.attachmentDir);
  await runClaudeCodePreflight(claudePath, process.env);

  let sessionId: string | null = null;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = abortSignal?.aborted ?? false;
  let activeChild: import("node:child_process").ChildProcess | null = null;
  let sessionTaskChain = Promise.resolve();

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        stopped = true;
        activeChild?.kill("SIGINT");
      },
      { once: true },
    );
  }

  async function runClaudeCodePrompt(
    prompt: string,
    opts?: { maxTurns?: number; signal?: AbortSignal },
  ): Promise<string> {
    if (stopped) return "";
    const args = buildClaudeArgsFromSettings(prompt, sessionId, bridgeSettings, opts);
    debugLog(`spawning claude: ${args.join(" ").slice(0, 200)}...`);

    const spawnEnv = { ...process.env };
    delete spawnEnv.CLAUDECODE;
    for (const key of Object.keys(spawnEnv)) {
      if (key.startsWith("PUB_DAEMON_")) delete spawnEnv[key];
    }
    const child = spawn(claudePath, args, {
      cwd,
      env: spawnEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChild = child;

    const stderrChunks: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    const rl = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
    let capturedSessionId: string | null = null;
    let terminalReason: string | null = null;
    const assistantChunks: string[] = [];
    const onAbort = () => {
      child.kill("SIGINT");
    };
    opts?.signal?.addEventListener("abort", onAbort, { once: true });

    for await (const line of rl) {
      if (stopped) break;
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      let event: { type?: string; [key: string]: unknown };
      try {
        event = JSON.parse(trimmed) as { type?: string; [key: string]: unknown };
      } catch {
        debugLog(`ignoring non-JSON claude stream line: ${trimmed.slice(0, 120)}`);
        continue;
      }

      const parsed = event as {
        type?: string;
        text?: unknown;
        delta?: { text?: unknown } | null;
        message?: { role?: unknown; content?: unknown } | null;
      };

      if (parsed.type === "result") {
        const result = event as {
          session_id?: string;
          terminal_reason?: string;
        };
        if (typeof result.session_id === "string" && result.session_id.length > 0) {
          capturedSessionId = result.session_id;
        }
        if (typeof result.terminal_reason === "string") {
          terminalReason = result.terminal_reason;
        }
      } else {
        const text =
          typeof parsed.text === "string"
            ? parsed.text
            : parsed.delta && typeof parsed.delta.text === "string"
              ? parsed.delta.text
              : parsed.message?.role === "assistant" && typeof parsed.message.content === "string"
                ? parsed.message.content
                : "";
        if (text.length > 0) assistantChunks.push(text);
      }
    }

    const exitCode = await new Promise<number | null>((resolve) => {
      if (child.exitCode !== null) {
        resolve(child.exitCode);
        return;
      }
      child.on("close", (code) => resolve(code));
    });

    activeChild = null;
    opts?.signal?.removeEventListener("abort", onAbort);
    if (capturedSessionId) {
      sessionId = capturedSessionId;
      debugLog(`captured session_id: ${sessionId}`);
    }

    if (exitCode !== null && exitCode !== 0 && !stopped) {
      const stderr = stderrChunks.join("").trim();
      debugLog(
        `claude exited with code ${exitCode} terminal_reason=${terminalReason ?? "unknown"} session=${capturedSessionId ?? "none"} stderr=${stderr.length > 0 ? stderr.slice(0, 200) : "(empty)"}`,
      );
      const errorDetail = evaluateClaudeExit({
        exitCode,
        terminalReason,
        capturedSessionId,
        stderr,
      });
      if (errorDetail) {
        throw new Error(`Claude Code exited with error: ${errorDetail}`);
      }
    }
    return assistantChunks.join("").trim();
  }

  function queueSessionTask<T>(task: () => Promise<T>): Promise<T> {
    const next = sessionTaskChain.then(task);
    sessionTaskChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async function deliver(prompt: string): Promise<void> {
    await queueSessionTask(async () => {
      await runClaudeCodePrompt(prompt);
    });
  }

  await queueSessionTask(async () => {
    await runClaudeCodePrompt(sessionBriefing, { maxTurns: SESSION_BRIEFING_MAX_TURNS });
  });
  debugLog("session briefing delivered");

  const handler = createEntryHandler({
    slug,
    attachmentRoot: bridgeSettings.attachmentDir,
    activeStreams,
    deliver,
    onDeliveryUpdate: config.onDeliveryUpdate,
    onForwarded: () => {
      forwardedMessageCount += 1;
    },
    onError: (message) => {
      lastError = message;
    },
    sendErrorToChat: createErrorChatSender(sendMessage),
    debugLog,
  });

  const queue = createBridgeEntryQueue({
    onProcessingStart: () => config.onActivityChange("thinking"),
    onProcessingEnd: () => config.onActivityChange("idle"),
    onBatch: handler.onBatch,
  });

  return {
    capabilities: CAPABILITIES,
    enqueue: (entries) => queue.enqueue(entries),
    invokeAgentCommand: async ({ prompt, output, signal }) =>
      await queueSessionTask(async () => {
        const text = await runClaudeCodePrompt(prompt, { signal });
        if (output === "json") {
          const trimmed = text.trim();
          return trimmed.length === 0 ? {} : (JSON.parse(trimmed) as unknown);
        }
        return text;
      }),
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      activeChild?.kill("SIGINT");
      await queue.stop();
    },
    status(): BridgeStatus {
      return {
        running: !stopped,
        sessionId: sessionId ?? undefined,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
