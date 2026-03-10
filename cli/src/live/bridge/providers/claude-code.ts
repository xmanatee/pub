import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { CHANNELS, generateMessageId } from "../../../../../shared/bridge-protocol-core";
import type { BridgeSettings } from "../../../core/config/index.js";
import { errorMessage } from "../../../core/errors/cli-error.js";
import {
  type ActiveStream,
  ensureDirectoryWritable,
  handleAttachmentEntry,
  MONITORED_ATTACHMENT_CHANNELS,
} from "../attachments.js";
import { createBridgeEntryQueue } from "../queue.js";
import {
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  type BufferedEntry,
  buildInboundPrompt,
  buildRenderErrorPrompt,
  readRenderErrorMessage,
  readTextChatMessage,
  shouldIncludeCanvasPolicyReminder,
} from "../shared.js";
import { buildClaudeArgs, runClaudeCodeBridgeStartupProbe, runClaudeCodePreflight } from "./claude-code-runtime.js";

export {
  buildClaudeArgs,
  isClaudeCodeAvailableInEnv,
  resolveClaudeCodePath,
  runClaudeCodeBridgeStartupProbe,
} from "./claude-code-runtime.js";

const SESSION_BRIEFING_MAX_TURNS = 3;

export async function createClaudeCodeBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;
  if (bridgeSettings.mode !== "claude-code") {
    throw new Error("Claude Code runtime is not prepared.");
  }

  const claudePath = bridgeSettings.claudeCodePath;
  const cwd = bridgeSettings.bridgeCwd;
  const attachmentRoot = bridgeSettings.attachmentDir;
  const attachmentMaxBytes = bridgeSettings.attachmentMaxBytes;
  const activeStreams = new Map<string, ActiveStream>();

  ensureDirectoryWritable(attachmentRoot);
  await runClaudeCodePreflight(claudePath, process.env);

  let sessionId: string | null = null;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = abortSignal?.aborted ?? false;
  let activeChild: import("node:child_process").ChildProcess | null = null;

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

  async function deliverToClaudeCode(prompt: string, opts?: { maxTurns?: number }): Promise<void> {
    if (stopped) return;
    const args = buildClaudeArgs(
      prompt,
      sessionId,
      config.instructions.systemPrompt,
      process.env,
      opts,
      bridgeSettings,
    );
    debugLog(`spawning claude: ${args.join(" ").slice(0, 200)}...`);

    const spawnEnv = { ...process.env };
    delete spawnEnv.CLAUDECODE;
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

      if (event.type === "result") {
        const result = event as { session_id?: string };
        if (typeof result.session_id === "string" && result.session_id.length > 0) {
          capturedSessionId = result.session_id;
        }
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
    if (capturedSessionId) {
      sessionId = capturedSessionId;
      debugLog(`captured session_id: ${sessionId}`);
    }

    if (exitCode !== null && exitCode !== 0 && !stopped) {
      const detail = stderrChunks.join("").trim() || `exit code ${exitCode}`;
      throw new Error(`Claude Code exited with error: ${detail}`);
    }
  }

  await deliverToClaudeCode(sessionBriefing, { maxTurns: SESSION_BRIEFING_MAX_TURNS });
  debugLog("session briefing delivered");

  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
      const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
        forwardedMessageCount + 1,
        bridgeSettings.canvasReminderEvery,
      );
      const chat = readTextChatMessage(entry);
      if (chat) {
        await deliverToClaudeCode(buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions));
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({ channel: entry.channel, messageId: entry.msg.id, stage: "confirmed" });
        return;
      }

      const renderError = readRenderErrorMessage(entry);
      if (renderError) {
        await deliverToClaudeCode(buildRenderErrorPrompt(slug, renderError, config.instructions));
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({ channel: entry.channel, messageId: entry.msg.id, stage: "confirmed" });
        return;
      }

      if (!MONITORED_ATTACHMENT_CHANNELS.has(entry.channel)) return;
      const deliveredAttachment = await handleAttachmentEntry({
        activeStreams,
        attachmentMaxBytes,
        attachmentRoot,
        deliverPrompt: async (prompt) => {
          await deliverToClaudeCode(prompt);
        },
        entry,
        includeCanvasReminder,
        instructions: config.instructions,
        slug,
      });
      if (deliveredAttachment) {
        forwardedMessageCount += 1;
        const deliveryMessageId =
          entry.msg.type === "stream-end" && typeof entry.msg.meta?.streamId === "string"
            ? entry.msg.meta.streamId
            : entry.msg.id;
        if (entry.msg.type === "binary" || entry.msg.type === "stream-end") {
          config.onDeliveryUpdate?.({ channel: entry.channel, messageId: deliveryMessageId, stage: "confirmed" });
        }
      }
    },
    onError: (error, entry) => {
      const message = errorMessage(error);
      lastError = message;
      debugLog(`bridge entry processing failed: ${message}`, error);
      const deliveryMessageId =
        entry.msg.type === "stream-end" && typeof entry.msg.meta?.streamId === "string"
          ? entry.msg.meta.streamId
          : entry.msg.id;
      config.onDeliveryUpdate?.({
        channel: entry.channel,
        messageId: deliveryMessageId,
        stage: "failed",
        error: message,
      });
      void sendMessage(CHANNELS.CHAT, {
        id: generateMessageId(),
        type: "text",
        data: `Bridge error: ${message}`,
      });
    },
  });

  return {
    enqueue: (entries) => queue.enqueue(entries),
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
