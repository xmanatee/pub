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
import { deliverMessageToCommand } from "./runtime.js";

export async function createOpenClawLikeBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "openclaw-like") {
    throw new Error("openclaw-like runtime is not prepared.");
  }
  const { slug, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;

  const command = bridgeSettings.openclawLikeCommand;
  const attachmentRoot = bridgeSettings.attachmentDir;
  ensureDirectoryWritable(attachmentRoot);

  const activeStreams = new Map<string, ActiveStream>();
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = false;

  await deliverMessageToCommand(
    { command, text: sessionBriefing },
    process.env,
    bridgeSettings,
  );
  debugLog("session briefing delivered");

  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
      const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
        forwardedMessageCount + 1,
        bridgeSettings.canvasReminderEvery,
      );
      const chat = readTextChatMessage(entry);
      if (chat) {
        await deliverMessageToCommand(
          { command, text: buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions) },
          process.env,
          bridgeSettings,
        );
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({ channel: entry.channel, messageId: entry.msg.id, stage: "confirmed" });
        return;
      }

      const renderError = readRenderErrorMessage(entry);
      if (renderError) {
        await deliverMessageToCommand(
          { command, text: buildRenderErrorPrompt(slug, renderError, config.instructions) },
          process.env,
          bridgeSettings,
        );
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({ channel: entry.channel, messageId: entry.msg.id, stage: "confirmed" });
        return;
      }

      if (!MONITORED_ATTACHMENT_CHANNELS.has(entry.channel)) return;
      const deliveredAttachment = await handleAttachmentEntry({
        activeStreams,
        attachmentRoot,
        deliverPrompt: async (prompt) => {
          await deliverMessageToCommand(
            { command, text: prompt },
            process.env,
            bridgeSettings,
          );
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
      void config.sendMessage(CHANNELS.CHAT, {
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
    },
    status(): BridgeStatus {
      return {
        running: !stopped,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
