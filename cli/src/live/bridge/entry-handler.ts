import { CHANNELS, generateMessageId } from "../../../../shared/bridge-protocol-core";
import { errorMessage } from "../../core/errors/cli-error.js";
import {
  type ActiveStream,
  handleAttachmentEntry,
  MONITORED_ATTACHMENT_CHANNELS,
} from "./attachments.js";
import {
  type BufferedEntry,
  buildBatchedInboundPrompt,
  buildRenderErrorPrompt,
  type DeliveryUpdate,
  readRenderErrorMessage,
  readTextChatMessage,
} from "./shared.js";

interface EntryHandlerConfig {
  slug: string;
  attachmentRoot: string;
  activeStreams: Map<string, ActiveStream>;
  deliver: (prompt: string) => Promise<void>;
  onDeliveryUpdate?: (update: DeliveryUpdate) => void;
  onForwarded: () => void;
  onError: (message: string) => void;
  sendErrorToChat: (message: string) => void;
  debugLog: (message: string, error?: unknown) => void;
}

function deliveryMessageId(entry: BufferedEntry): string {
  if (entry.msg.type === "stream-end" && typeof entry.msg.meta?.streamId === "string") {
    return entry.msg.meta.streamId;
  }
  return entry.msg.id;
}

function confirmEntry(config: EntryHandlerConfig, entry: BufferedEntry): void {
  config.onForwarded();
  config.onDeliveryUpdate?.({
    channel: entry.channel,
    messageId: deliveryMessageId(entry),
    stage: "confirmed",
  });
}

function failEntries(config: EntryHandlerConfig, entries: BufferedEntry[], error: unknown): void {
  const message = errorMessage(error);
  config.onError(message);
  config.debugLog(`bridge entry processing failed: ${message}`, error);
  config.sendErrorToChat(`Bridge error: ${message}`);
  for (const entry of entries) {
    config.onDeliveryUpdate?.({
      channel: entry.channel,
      messageId: deliveryMessageId(entry),
      stage: "failed",
      error: message,
    });
  }
}

export function createEntryHandler(config: EntryHandlerConfig) {
  async function onBatch(entries: BufferedEntry[]): Promise<void> {
    const chatEntries: BufferedEntry[] = [];
    const chatTexts: string[] = [];
    const renderErrors: BufferedEntry[] = [];
    const attachments: BufferedEntry[] = [];

    for (const entry of entries) {
      const chat = readTextChatMessage(entry);
      if (chat) {
        chatEntries.push(entry);
        chatTexts.push(chat);
        continue;
      }
      if (readRenderErrorMessage(entry)) {
        renderErrors.push(entry);
        continue;
      }
      if (MONITORED_ATTACHMENT_CHANNELS.has(entry.channel)) {
        attachments.push(entry);
      }
    }

    if (chatTexts.length > 0) {
      try {
        await config.deliver(buildBatchedInboundPrompt(config.slug, chatTexts));
        for (const entry of chatEntries) confirmEntry(config, entry);
      } catch (error) {
        failEntries(config, chatEntries, error);
      }
    }

    if (renderErrors.length > 0) {
      try {
        const last = renderErrors[renderErrors.length - 1];
        const errorText = readRenderErrorMessage(last) ?? "";
        await config.deliver(buildRenderErrorPrompt(config.slug, errorText));
        for (const entry of renderErrors) confirmEntry(config, entry);
      } catch (error) {
        failEntries(config, renderErrors, error);
      }
    }

    for (const entry of attachments) {
      try {
        const delivered = await handleAttachmentEntry({
          activeStreams: config.activeStreams,
          attachmentRoot: config.attachmentRoot,
          deliverPrompt: config.deliver,
          entry,
          slug: config.slug,
        });
        if (delivered && (entry.msg.type === "binary" || entry.msg.type === "stream-end")) {
          confirmEntry(config, entry);
        }
      } catch (error) {
        failEntries(config, [entry], error);
      }
    }
  }

  return { onBatch };
}

export function createErrorChatSender(
  sendMessage: (
    channel: string,
    msg: import("../../../../shared/bridge-protocol-core").BridgeMessage,
  ) => Promise<boolean>,
): (message: string) => void {
  return (message: string) => {
    void sendMessage(CHANNELS.CHAT, {
      id: generateMessageId(),
      type: "text",
      data: message,
    });
  };
}
