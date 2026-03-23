import { type ActiveStream, ensureDirectoryWritable } from "../../attachments.js";
import { createEntryHandler, createErrorChatSender } from "../../entry-handler.js";
import { createBridgeEntryQueue } from "../../queue.js";
import {
  type BridgeCapabilities,
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  prependSystemPrompt,
} from "../../shared.js";
import { deliverMessageToCommand } from "./runtime.js";

export { runOpenClawLikeBridgeStartupProbe } from "./probe.js";

const CAPABILITIES: BridgeCapabilities = { conversational: true };

export async function createOpenClawLikeBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "openclaw-like") {
    throw new Error("openclaw-like runtime is not prepared.");
  }
  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;

  const command = bridgeSettings.openclawLikeCommand;
  ensureDirectoryWritable(bridgeSettings.attachmentDir);

  const activeStreams = new Map<string, ActiveStream>();
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = false;

  await deliverMessageToCommand({ command, text: sessionBriefing }, process.env, bridgeSettings);
  debugLog("session briefing delivered");

  async function deliver(prompt: string): Promise<void> {
    await deliverMessageToCommand(
      { command, text: prependSystemPrompt(prompt) },
      process.env,
      bridgeSettings,
    );
  }

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
