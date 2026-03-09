import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CHANNELS, generateMessageId } from "../../../shared/bridge-protocol-core";
import { errorMessage } from "./cli-error.js";
import { isClaudeCodeAvailableInEnv, resolveClaudeCodePath } from "./live-bridge-claude-code.js";
import { createBridgeEntryQueue } from "./live-bridge-queue.js";
import {
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  type BufferedEntry,
  buildInboundPrompt,
  buildRenderErrorPrompt,
  readRenderErrorMessage,
  readTextChatMessage,
  resolveCanvasReminderEvery,
  shouldIncludeCanvasPolicyReminder,
} from "./live-bridge-shared.js";
import { runAgentWritePongProbe } from "./live-runtime/bridge-write-probe.js";

type ClaudeSdk = typeof import("@anthropic-ai/claude-agent-sdk");

async function tryImportSdk(): Promise<ClaudeSdk | null> {
  try {
    return await import("@anthropic-ai/claude-agent-sdk");
  } catch {
    return null;
  }
}

export function isClaudeSdkAvailableInEnv(env: NodeJS.ProcessEnv): boolean {
  return isClaudeCodeAvailableInEnv(env);
}

export async function isClaudeSdkImportable(): Promise<boolean> {
  return (await tryImportSdk()) !== null;
}

export function buildSdkSessionOptions(env: NodeJS.ProcessEnv = process.env) {
  const model = env.CLAUDE_CODE_MODEL?.trim() || "claude-sonnet-4-6";
  const claudePath = resolveClaudeCodePath(env);

  const allowedToolsRaw = env.CLAUDE_CODE_ALLOWED_TOOLS?.trim();
  const allowedTools = allowedToolsRaw
    ? allowedToolsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  const sdkEnv: Record<string, string | undefined> = { ...env };
  delete sdkEnv.CLAUDECODE;

  return { model, claudePath, allowedTools, sdkEnv };
}

function buildAppendSystemPrompt(
  bridgeSystemPrompt: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const userSystemPrompt = env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim();
  const effective = [bridgeSystemPrompt, userSystemPrompt].filter(Boolean).join("\n\n");
  return effective.length > 0 ? effective : undefined;
}

export async function runClaudeSdkBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ claudePath: string; cwd?: string }> {
  const { model, claudePath, allowedTools } = buildSdkSessionOptions(env);
  const cwd = env.CLAUDE_CODE_CWD?.trim() || env.PUBBLUE_PROJECT_ROOT || undefined;

  const sdk = await tryImportSdk();
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

      const socketPath = probeEnv.PUBBLUE_AGENT_SOCKET ?? "";
      const logPath = path.join(os.tmpdir(), "pubblue-sdk-probe.log");
      const appendLog = (line: string) => {
        try {
          fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
        } catch {}
      };

      appendLog(`probe start socket=${socketPath}`);

      const prompt = [
        "This is a startup connectivity probe.",
        "Run this exact shell command now:",
        `PUBBLUE_AGENT_SOCKET=${socketPath} pubblue write "pong"`,
        "Do not explain. Just execute it.",
      ].join("\n");

      // v1 query() supports cwd + maxTurns; v2 createSession does not.
      const q = sdk.query({
        prompt,
        options: {
          model,
          pathToClaudeCodeExecutable: claudePath,
          env: probeEnvClean,
          allowedTools,
          cwd: os.tmpdir(),
          maxTurns: 2,
          persistSession: false,
          canUseTool: async (toolName, input) => {
            appendLog(`canUseTool: tool=${toolName}`);
            return { behavior: "allow" as const, updatedInput: input };
          },
        },
      });

      for await (const msg of q) {
        appendLog(`msg: type=${msg.type} ${JSON.stringify(msg).slice(0, 300)}`);
      }

      appendLog("probe stream completed");
    },
  });

  return { claudePath, cwd };
}

const MAX_SESSION_RECREATIONS = 2;

export async function createClaudeSdkBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const env = process.env;

  const sdk = await tryImportSdk();
  if (!sdk) {
    throw new Error("Claude Agent SDK is not importable.");
  }
  const resolvedSdk = sdk;

  const { model, claudePath, allowedTools, sdkEnv } = buildSdkSessionOptions(env);
  const appendSystemPrompt = buildAppendSystemPrompt(config.instructions.systemPrompt, env);

  let sessionId: string | undefined;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = abortSignal?.aborted ?? false;
  let sessionRecreations = 0;

  type SdkSession = ReturnType<ClaudeSdk["unstable_v2_createSession"]>;
  let activeSession: SdkSession | null = null;

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        stopped = true;
        activeSession?.close();
      },
      { once: true },
    );
  }

  const canvasReminderEvery = resolveCanvasReminderEvery();

  function createSession(): SdkSession {
    const session = resolvedSdk.unstable_v2_createSession({
      model,
      pathToClaudeCodeExecutable: claudePath,
      env: {
        ...sdkEnv,
        ...(appendSystemPrompt ? { CLAUDE_CODE_APPEND_SYSTEM_PROMPT: appendSystemPrompt } : {}),
      },
      allowedTools,
      canUseTool: async (_tool, input) => ({ behavior: "allow" as const, updatedInput: input }),
    });
    activeSession = session;
    return session;
  }

  async function consumeStream(session: SdkSession): Promise<void> {
    for await (const msg of session.stream()) {
      if (stopped) break;
      if (msg.type === "assistant") {
        debugLog(`sdk assistant message received`);
      } else if (msg.type === "result") {
        if ("session_id" in msg && typeof msg.session_id === "string") {
          sessionId = msg.session_id;
          debugLog(`captured session_id: ${sessionId}`);
        }
        if (msg.subtype !== "success") {
          throw new Error(`Claude SDK result error: ${msg.subtype}`);
        }
      }
    }
  }

  async function sendAndStream(session: SdkSession, prompt: string): Promise<void> {
    await session.send(prompt);
    await consumeStream(session);
  }

  async function deliverWithRecovery(prompt: string): Promise<void> {
    if (stopped) return;

    try {
      if (!activeSession) throw new Error("session not initialized");
      await sendAndStream(activeSession, prompt);
    } catch (error) {
      const msg = errorMessage(error);
      debugLog(`session error: ${msg}`, error);

      if (stopped || sessionRecreations >= MAX_SESSION_RECREATIONS) {
        throw error;
      }

      debugLog(`recreating session (attempt ${sessionRecreations + 1}/${MAX_SESSION_RECREATIONS})`);
      sessionRecreations += 1;

      try {
        activeSession?.close();
      } catch {}

      const newSession = createSession();
      await sendAndStream(newSession, sessionBriefing);
      debugLog("session briefing re-delivered after recovery");

      await sendAndStream(newSession, prompt);
    }
  }

  const session = createSession();
  await sendAndStream(session, sessionBriefing);
  debugLog("session briefing delivered via SDK");

  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
      const chat = readTextChatMessage(entry);
      if (chat) {
        const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
          forwardedMessageCount + 1,
          canvasReminderEvery,
        );
        const prompt = buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions);
        await deliverWithRecovery(prompt);
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({
          channel: entry.channel,
          messageId: entry.msg.id,
          stage: "confirmed",
        });
        return;
      }

      const renderError = readRenderErrorMessage(entry);
      if (renderError) {
        const prompt = buildRenderErrorPrompt(slug, renderError, config.instructions);
        await deliverWithRecovery(prompt);
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({
          channel: entry.channel,
          messageId: entry.msg.id,
          stage: "confirmed",
        });
        return;
      }

      if (
        entry.msg.type === "binary" ||
        entry.msg.type === "stream-start" ||
        entry.msg.type === "stream-end"
      ) {
        const streamId =
          typeof entry.msg.meta?.streamId === "string" ? entry.msg.meta.streamId : undefined;
        if (entry.msg.type === "binary" && streamId) return;
        const deliveryMessageId =
          entry.msg.type === "stream-end" && streamId ? streamId : entry.msg.id;
        config.onDeliveryUpdate?.({
          channel: entry.channel,
          messageId: deliveryMessageId,
          stage: "failed",
          error: "Attachments are not supported in Claude SDK bridge mode.",
        });
        if (entry.msg.type !== "stream-end") {
          void sendMessage(CHANNELS.CHAT, {
            id: generateMessageId(),
            type: "text",
            data: "Attachments are not supported in Claude SDK bridge mode.",
          });
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
  debugLog(`claude-sdk bridge runner started (path=${claudePath})`);

  return {
    enqueue: (entries) => queue.enqueue(entries),

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      try {
        activeSession?.close();
      } catch {}
      activeSession = null;
      await queue.stop();
    },

    status(): BridgeStatus {
      return {
        running: !stopped,
        sessionId,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
