import { CHANNELS, generateMessageId } from "../../../../../../shared/bridge-protocol-core";
import { errorMessage } from "../../../../core/errors/cli-error.js";
import {
  type ActiveStream,
  ensureDirectoryWritable,
  handleAttachmentEntry,
  MONITORED_ATTACHMENT_CHANNELS,
} from "../../attachments.js";
import { createBridgeEntryQueue } from "../../queue.js";
import {
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  type BufferedEntry,
  buildInboundPrompt,
  buildRenderErrorPrompt,
  readRenderErrorMessage,
  readTextChatMessage,
} from "../../shared.js";
import { readSdkAssistantText } from "./event-reader.js";
import { buildSdkSessionOptionsFromSettings, loadClaudeSdk } from "./runtime.js";

export {
  buildSdkSessionOptions,
  isClaudeSdkAvailableInEnv,
} from "./discovery.js";
export { runClaudeSdkBridgeStartupProbe } from "./probe.js";
export { buildSdkSessionOptionsFromSettings } from "./runtime.js";

const MAX_SESSION_RECREATIONS = 2;
const SESSION_BRIEFING_MAX_TURNS = 2;

export async function createClaudeSdkBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "claude-sdk") {
    throw new Error("Claude SDK runtime is not prepared.");
  }
  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;

  const loadedSdk = loadClaudeSdk();

  const { model, claudePath, sdkEnv } = buildSdkSessionOptionsFromSettings(
    bridgeSettings,
    process.env,
  );
  const attachmentRoot = bridgeSettings.attachmentDir;
  const activeStreams = new Map<string, ActiveStream>();
  ensureDirectoryWritable(attachmentRoot);

  let sessionId: string | undefined;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = abortSignal?.aborted ?? false;
  let sessionRecreations = 0;
  let sessionTaskChain = Promise.resolve();

  type SdkSession = ReturnType<typeof loadedSdk.unstable_v2_createSession>;
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

  function createSession(): SdkSession {
    const session = loadedSdk.unstable_v2_createSession({
      model,
      pathToClaudeCodeExecutable: claudePath,
      env: sdkEnv,
      canUseTool: async (_tool, input) => ({ behavior: "allow" as const, updatedInput: input }),
    });
    activeSession = session;
    return session;
  }

  async function consumeStream(session: SdkSession, opts?: { maxTurns?: number }): Promise<string> {
    let collected = "";
    let turnCount = 0;
    const maxTurns = opts?.maxTurns;
    for await (const msg of session.stream()) {
      if (stopped) break;
      if (maxTurns !== undefined && msg.type === "assistant") {
        turnCount += 1;
        if (turnCount > maxTurns) {
          debugLog(`max turns reached (${maxTurns}), stopping stream`);
          break;
        }
      }
      const text = readSdkAssistantText(msg);
      if (text.length > 0) {
        collected += text;
      }
      if (msg.type === "result") {
        if ("session_id" in msg && typeof msg.session_id === "string") {
          sessionId = msg.session_id;
          debugLog(`captured session_id: ${sessionId}`);
        }
        if (msg.subtype !== "success") {
          throw new Error(`Claude SDK result error: ${msg.subtype}`);
        }
      }
    }
    return collected.trim();
  }

  async function sendAndStream(
    session: SdkSession,
    prompt: string,
    opts?: { maxTurns?: number },
  ): Promise<string> {
    await session.send(prompt);
    return await consumeStream(session, opts);
  }

  async function deliverWithRecovery(prompt: string): Promise<string> {
    if (stopped) return "";

    try {
      if (!activeSession) throw new Error("session not initialized");
      return await sendAndStream(activeSession, prompt);
    } catch (error) {
      debugLog(`session error: ${errorMessage(error)}`, error);
      if (stopped || sessionRecreations >= MAX_SESSION_RECREATIONS) {
        throw error;
      }

      sessionRecreations += 1;
      try {
        activeSession?.close();
      } catch (closeError) {
        debugLog(`failed to close previous SDK session: ${errorMessage(closeError)}`, closeError);
      }

      const newSession = createSession();
      await sendAndStream(newSession, sessionBriefing, { maxTurns: SESSION_BRIEFING_MAX_TURNS });
      return await sendAndStream(newSession, prompt);
    }
  }

  function queueSessionTask<T>(task: () => Promise<T>): Promise<T> {
    const next = sessionTaskChain.then(task);
    sessionTaskChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async function deliverQueued(prompt: string): Promise<string> {
    return await queueSessionTask(async () => await deliverWithRecovery(prompt));
  }

  await sendAndStream(createSession(), sessionBriefing, { maxTurns: SESSION_BRIEFING_MAX_TURNS });

  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
      const chat = readTextChatMessage(entry);
      if (chat) {
        await deliverQueued(buildInboundPrompt(slug, chat));
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
        await deliverQueued(buildRenderErrorPrompt(slug, renderError));
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
        attachmentRoot,
        deliverPrompt: async (prompt) => {
          await deliverQueued(prompt);
        },
        entry,
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
    invokeAgentCommand: async ({ prompt, output }) =>
      await queueSessionTask(async () => {
        const text = await deliverWithRecovery(prompt);
        if (output === "json") {
          const trimmed = text.trim();
          return trimmed.length === 0 ? {} : (JSON.parse(trimmed) as unknown);
        }
        return text;
      }),
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
