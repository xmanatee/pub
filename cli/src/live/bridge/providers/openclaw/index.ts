import { type ActiveStream, ensureDirectoryWritable } from "../../attachments.js";
import { createEntryHandler, createErrorChatSender } from "../../entry-handler.js";
import { createBridgeEntryQueue } from "../../queue.js";
import type {
  BridgeCapabilities,
  BridgeRunner,
  BridgeRunnerConfig,
  BridgeStatus,
} from "../../shared.js";
import { deliverMessageToOpenClaw, invokeOpenClawPrompt } from "./runtime.js";

export { isOpenClawAvailable } from "./discovery.js";
export { runOpenClawBridgeStartupProbe } from "./probe.js";

function buildBridgeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PUB_DAEMON_MODE;
  return env;
}

const CAPABILITIES: BridgeCapabilities = { conversational: true };

export async function createOpenClawBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "openclaw") {
    throw new Error("OpenClaw runtime is not prepared.");
  }
  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;
  const bridgeEnv = buildBridgeEnv();

  const openclawPath = bridgeSettings.openclawPath;
  const sessionId = bridgeSettings.sessionId;
  ensureDirectoryWritable(bridgeSettings.attachmentDir);

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

  const useLocal = bridgeEnv.OPENCLAW_LOCAL === "1";

  async function deliver(prompt: string): Promise<void> {
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
