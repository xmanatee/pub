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
  deliverMessageToOpenClaw,
  runOpenClawPreflight,
} from "./runtime.js";

export {
  deliverMessageToOpenClaw,
} from "./runtime.js";
export {
  isOpenClawAvailable,
  resolveOpenClawPath,
  resolveOpenClawRuntime,
} from "./discovery.js";
export { runOpenClawBridgeStartupProbe } from "./probe.js";

export async function createOpenClawBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  const { slug, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;
  if (bridgeSettings.mode !== "openclaw") {
    throw new Error("OpenClaw runtime is not prepared.");
  }

  const openclawPath = bridgeSettings.openclawPath;
  const sessionId = bridgeSettings.sessionId;
  const attachmentRoot = bridgeSettings.attachmentDir;
  const attachmentMaxBytes = bridgeSettings.attachmentMaxBytes;
  ensureDirectoryWritable(attachmentRoot);
  await runOpenClawPreflight(openclawPath, process.env);

  const activeStreams = new Map<string, ActiveStream>();
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = false;

  await deliverMessageToOpenClaw(
    { openclawPath, sessionId, text: sessionBriefing },
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
        await deliverMessageToOpenClaw(
          { openclawPath, sessionId, text: buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions) },
          process.env,
          bridgeSettings,
        );
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({ channel: entry.channel, messageId: entry.msg.id, stage: "confirmed" });
        return;
      }

      const renderError = readRenderErrorMessage(entry);
      if (renderError) {
        await deliverMessageToOpenClaw(
          { openclawPath, sessionId, text: buildRenderErrorPrompt(slug, renderError, config.instructions) },
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
        attachmentMaxBytes,
        attachmentRoot,
        deliverPrompt: async (prompt) => {
          await deliverMessageToOpenClaw(
            { openclawPath, sessionId, text: prompt },
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
        sessionId,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
