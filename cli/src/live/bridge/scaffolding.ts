import { CHANNELS, generateMessageId } from "../../../../shared/bridge-protocol-core";
import { type ActiveStream, ensureDirectoryWritable } from "./attachments.js";
import { createEntryHandler, createErrorChatSender } from "./entry-handler.js";
import { createBridgeEntryQueue } from "./queue.js";
import type { BridgeRunnerConfig, BridgeStatus } from "./shared.js";

export interface BridgeScaffolding {
  readonly queue: ReturnType<typeof createBridgeEntryQueue>;
  readonly activeStreams: Map<string, ActiveStream>;
  readonly sendChatText: (text: string) => Promise<void>;
  readonly status: () => Pick<BridgeStatus, "forwardedMessages" | "lastError">;
}

/**
 * Shared provider plumbing: attachment dir, entry handler, work queue, chat
 * delivery, and forwarded/error status tracking. Providers own their runtime
 * (subprocess, SDK session, socket) and plug in via `deliver`.
 */
export function createBridgeScaffolding(
  config: BridgeRunnerConfig,
  deliver: (prompt: string) => Promise<void>,
): BridgeScaffolding {
  ensureDirectoryWritable(config.bridgeSettings.attachmentDir);
  const activeStreams = new Map<string, ActiveStream>();
  let forwardedMessageCount = 0;
  let lastError: string | undefined;

  const handler = createEntryHandler({
    slug: config.slug,
    attachmentRoot: config.bridgeSettings.attachmentDir,
    activeStreams,
    deliver,
    onDeliveryUpdate: config.onDeliveryUpdate,
    onForwarded: () => {
      forwardedMessageCount += 1;
    },
    onError: (message) => {
      lastError = message;
    },
    sendErrorToChat: createErrorChatSender(config.sendMessage),
    debugLog: config.debugLog,
  });

  const queue = createBridgeEntryQueue({
    onProcessingStart: () => config.onActivityChange("thinking"),
    onProcessingEnd: () => config.onActivityChange("idle"),
    onBatch: handler.onBatch,
  });

  return {
    queue,
    activeStreams,
    async sendChatText(text: string): Promise<void> {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      await config.sendMessage(CHANNELS.CHAT, {
        id: generateMessageId(),
        type: "text",
        data: trimmed,
      });
    },
    status: () => ({ forwardedMessages: forwardedMessageCount, lastError }),
  };
}
