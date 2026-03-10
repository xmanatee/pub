import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { CHANNELS, generateMessageId } from "../../../shared/bridge-protocol-core";
import { errorMessage } from "./cli-error.js";
import type { BridgeConfig, PreparedBridgeConfig, PreparedClaudeBridgeConfig } from "./config.js";
import {
  type ActiveStream,
  ensureDirectoryWritable,
  handleAttachmentEntry,
  MONITORED_ATTACHMENT_CHANNELS,
} from "./live-bridge-attachments.js";
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
  shouldIncludeCanvasPolicyReminder,
} from "./live-bridge-shared.js";
import { runAgentWritePongProbe } from "./live-runtime/bridge-write-probe.js";

const require = createRequire(import.meta.url);
const CLAUDE_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

type ClaudeSdk = typeof import("@anthropic-ai/claude-agent-sdk");

async function tryImportSdk(): Promise<ClaudeSdk | null> {
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
  return (await tryImportSdk()) !== null;
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
        .map((t) => t.trim())
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

function buildAppendSystemPrompt(
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
        `PUB_AGENT_SOCKET=${socketPath} pub write "pong"`,
        "Do not explain. Just execute it.",
      ].join("\n");

      const q = sdk.query({
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
  const prepared = config.bridgeConfig;
  if (prepared.mode !== "claude-sdk") {
    throw new Error("Claude SDK runtime is not prepared.");
  }

  const sdk = await tryImportSdk();
  if (!sdk) {
    throw new Error("Claude Agent SDK is not importable.");
  }
  const loadedSdk = sdk;

  const { model, claudePath, allowedTools, sdkEnv } = buildSdkSessionOptions(
    env,
    prepared,
  );
  const appendSystemPrompt = buildAppendSystemPrompt(
    config.instructions.systemPrompt,
    env,
    prepared,
  );
  const attachmentRoot = prepared.attachmentDir;
  const attachmentMaxBytes = prepared.attachmentMaxBytes;
  const activeStreams = new Map<string, ActiveStream>();

  ensureDirectoryWritable(attachmentRoot);

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

  const canvasReminderEvery = prepared.canvasReminderEvery;

  function createSession(): SdkSession {
    const session = loadedSdk.unstable_v2_createSession({
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
        debugLog("sdk assistant message received");
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
      } catch (error) {
        debugLog(`failed to close previous SDK session: ${errorMessage(error)}`, error);
      }

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
      const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
        forwardedMessageCount + 1,
        canvasReminderEvery,
      );
      const chat = readTextChatMessage(entry);
      if (chat) {
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

      if (!MONITORED_ATTACHMENT_CHANNELS.has(entry.channel)) return;
      const deliveredAttachment = await handleAttachmentEntry({
        activeStreams,
        attachmentMaxBytes,
        attachmentRoot,
        deliverPrompt: async (prompt) => {
          await deliverWithRecovery(prompt);
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
          config.onDeliveryUpdate?.({
            channel: entry.channel,
            messageId: deliveryMessageId,
            stage: "confirmed",
          });
        }
      }
    },
    onError: (error, entry) => {
      const message = errorMessage(error);
      lastError = message;
      debugLog(`bridge entry processing failed: ${message}`, error);
      config.onDeliveryUpdate?.({
        channel: entry.channel,
        messageId: entry.msg.id,
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
      await queue.stop();
      activeSession?.close();
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
