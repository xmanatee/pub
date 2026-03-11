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
  applyBridgeSystemPrompt,
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
  invokeOpenClawPrompt,
  runOpenClawPreflight,
} from "./runtime.js";

export {
  isOpenClawAvailable,
  resolveOpenClawPath,
  resolveOpenClawRuntime,
} from "./discovery.js";
export { runOpenClawBridgeStartupProbe } from "./probe.js";
export { deliverMessageToOpenClaw } from "./runtime.js";

export async function createOpenClawBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "openclaw") {
    throw new Error("OpenClaw runtime is not prepared.");
  }
  const { slug, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;

  const openclawPath = bridgeSettings.openclawPath;
  const sessionId = bridgeSettings.sessionId;
  const attachmentRoot = bridgeSettings.attachmentDir;
  ensureDirectoryWritable(attachmentRoot);
  await runOpenClawPreflight(openclawPath, process.env);

  const activeStreams = new Map<string, ActiveStream>();
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = false;
  let sessionTaskChain = Promise.resolve();

  const withSystemPrompt = (prompt: string) => applyBridgeSystemPrompt(prompt, config.instructions);
  function queueSessionTask<T>(task: () => Promise<T>): Promise<T> {
    const next = sessionTaskChain.then(task);
    sessionTaskChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  async function deliverQueued(prompt: string): Promise<void> {
    await queueSessionTask(async () => {
      await deliverMessageToOpenClaw(
        { openclawPath, sessionId, text: withSystemPrompt(prompt) },
        process.env,
        bridgeSettings,
      );
    });
  }

  await deliverMessageToOpenClaw(
    { openclawPath, sessionId, text: withSystemPrompt(sessionBriefing) },
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
        await deliverQueued(buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions));
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
        await deliverQueued(buildRenderErrorPrompt(slug, renderError, config.instructions));
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
    invokeAgentCommand: async ({ prompt, output }) =>
      await queueSessionTask(async () => {
        const text = await invokeOpenClawPrompt({
          openclawPath,
          sessionId,
          text: withSystemPrompt(prompt),
          bridgeCwd: bridgeSettings.bridgeCwd,
          env: process.env,
        });
        if (output === "json") {
          return text.length === 0 ? {} : (JSON.parse(text) as unknown);
        }
        return text;
      }),
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
