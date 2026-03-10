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
  shouldIncludeCanvasPolicyReminder,
} from "../../shared.js";
import {
  buildSdkSessionOptionsFromSettings,
  loadClaudeSdk,
} from "./runtime.js";

export {
  buildSdkSessionOptions,
  isClaudeSdkAvailableInEnv,
} from "./discovery.js";
export {
  buildSdkSessionOptionsFromSettings,
} from "./runtime.js";
export { runClaudeSdkBridgeStartupProbe } from "./probe.js";

const MAX_SESSION_RECREATIONS = 2;

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
  const systemPrompt = config.instructions.systemPrompt ?? undefined;
  const attachmentRoot = bridgeSettings.attachmentDir;
  const activeStreams = new Map<string, ActiveStream>();
  ensureDirectoryWritable(attachmentRoot);

  let sessionId: string | undefined;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = abortSignal?.aborted ?? false;
  let sessionRecreations = 0;

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
      env: {
        ...sdkEnv,
        ...(systemPrompt ? { CLAUDE_CODE_APPEND_SYSTEM_PROMPT: systemPrompt } : {}),
      },
      canUseTool: async (_tool, input) => ({ behavior: "allow" as const, updatedInput: input }),
    });
    activeSession = session;
    return session;
  }

  async function consumeStream(session: SdkSession): Promise<void> {
    for await (const msg of session.stream()) {
      if (stopped) break;
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
      await sendAndStream(newSession, sessionBriefing);
      await sendAndStream(newSession, prompt);
    }
  }

  await sendAndStream(createSession(), sessionBriefing);

  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
      const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
        forwardedMessageCount + 1,
        bridgeSettings.canvasReminderEvery,
      );
      const chat = readTextChatMessage(entry);
      if (chat) {
        await deliverWithRecovery(buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions));
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({ channel: entry.channel, messageId: entry.msg.id, stage: "confirmed" });
        return;
      }

      const renderError = readRenderErrorMessage(entry);
      if (renderError) {
        await deliverWithRecovery(buildRenderErrorPrompt(slug, renderError, config.instructions));
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({ channel: entry.channel, messageId: entry.msg.id, stage: "confirmed" });
        return;
      }

      if (!MONITORED_ATTACHMENT_CHANNELS.has(entry.channel)) return;
      const deliveredAttachment = await handleAttachmentEntry({
        activeStreams,
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
