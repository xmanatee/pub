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
import { deliverMessageToOpenClaw, invokeOpenClawPrompt } from "./runtime.js";

export { isOpenClawAvailable } from "./discovery.js";
export { runOpenClawBridgeStartupProbe } from "./probe.js";

function buildBridgeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // OpenClaw spawns `pub write` as a child process. If PUB_DAEMON_MODE leaks
  // through, the pub binary starts as a daemon instead of running the CLI command.
  delete env.PUB_DAEMON_MODE;
  return env;
}

export async function createOpenClawBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "openclaw") {
    throw new Error("OpenClaw runtime is not prepared.");
  }
  const { slug, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;
  const bridgeEnv = buildBridgeEnv();

  const openclawPath = bridgeSettings.openclawPath;
  const sessionId = bridgeSettings.sessionId;
  const attachmentRoot = bridgeSettings.attachmentDir;
  ensureDirectoryWritable(attachmentRoot);

  const activeStreams = new Map<string, ActiveStream>();
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = false;
  let sessionTaskChain = Promise.resolve();

  function queueSessionTask<T>(task: () => Promise<T>): Promise<T> {
    const next = sessionTaskChain.then(task);
    sessionTaskChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  // When OPENCLAW_LOCAL=1, use --local (embedded) mode so tools inherit the daemon's env.
  // Needed when the gateway lacks per-session env vars (e.g. PUB_AGENT_SOCKET in E2E tests).
  const useLocal = bridgeEnv.OPENCLAW_LOCAL === "1";

  async function deliverQueued(prompt: string): Promise<void> {
    await queueSessionTask(async () => {
      await deliverMessageToOpenClaw(
        { openclawPath, sessionId, text: prompt, local: useLocal },
        bridgeEnv,
        bridgeSettings,
      );
    });
  }

  debugLog(`openclaw deliver session briefing start slug=${slug} sessionId=${sessionId}`);
  await deliverMessageToOpenClaw(
    { openclawPath, sessionId, text: sessionBriefing, local: useLocal },
    bridgeEnv,
    bridgeSettings,
  );
  debugLog(`openclaw deliver session briefing complete slug=${slug} sessionId=${sessionId}`);

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
      void config.sendMessage(CHANNELS.CHAT, {
        id: generateMessageId(),
        type: "text",
        data: `Bridge error: ${message}`,
      });
    },
  });

  return {
    enqueue: (entries) => queue.enqueue(entries),
    invokeAgentCommand: async ({ prompt, output, signal, timeoutMs }) =>
      await queueSessionTask(async () => {
        const text = await invokeOpenClawPrompt({
          openclawPath,
          sessionId,
          text: prompt,
          bridgeCwd: bridgeSettings.bridgeCwd,
          env: bridgeEnv,
          local: useLocal,
          signal,
          timeoutMs,
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
