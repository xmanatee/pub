import { type ActiveStream, ensureDirectoryWritable } from "../../attachments.js";
import { createEntryHandler, createErrorChatSender } from "../../entry-handler.js";
import { createBridgeEntryQueue } from "../../queue.js";
import { createSessionTaskQueue } from "../../session-task-queue.js";
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
  abortSignal?: AbortSignal,
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
  let stopped = abortSignal?.aborted ?? false;
  const queueSessionTask = createSessionTaskQueue();
  const runnerAbort = new AbortController();

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        stopped = true;
        runnerAbort.abort();
      },
      { once: true },
    );
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  const useLocal = bridgeEnv.OPENCLAW_LOCAL === "1";

  async function deliver(prompt: string): Promise<void> {
    await queueSessionTask(async () => {
      if (stopped) return;
      try {
        await deliverMessageToOpenClaw(
          {
            openclawPath,
            sessionId,
            text: prompt,
            local: useLocal,
            signal: runnerAbort.signal,
          },
          bridgeEnv,
          bridgeSettings,
        );
      } catch (error) {
        if (stopped && isAbortError(error)) return;
        throw error;
      }
    });
  }

  debugLog(`openclaw deliver session briefing start slug=${slug} sessionId=${sessionId}`);
  try {
    await deliverMessageToOpenClaw(
      {
        openclawPath,
        sessionId,
        text: sessionBriefing,
        local: useLocal,
        signal: runnerAbort.signal,
      },
      bridgeEnv,
      bridgeSettings,
    );
  } catch (error) {
    if (!(stopped && isAbortError(error))) {
      throw error;
    }
  }
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
        if (stopped) return output === "json" ? {} : "";
        const taskAbort = new AbortController();
        const abortTask = () => {
          taskAbort.abort();
        };
        runnerAbort.signal.addEventListener("abort", abortTask, { once: true });
        signal.addEventListener("abort", abortTask, { once: true });
        let text = "";
        try {
          text = await invokeOpenClawPrompt({
            openclawPath,
            sessionId,
            text: prompt,
            workspaceDir: bridgeSettings.workspaceDir,
            env: bridgeEnv,
            local: useLocal,
            signal: taskAbort.signal,
            timeoutMs,
          });
        } catch (error) {
          if (stopped && isAbortError(error)) {
            return output === "json" ? {} : "";
          }
          throw error;
        } finally {
          runnerAbort.signal.removeEventListener("abort", abortTask);
          signal.removeEventListener("abort", abortTask);
        }
        if (output === "json") {
          return text.length === 0 ? {} : (JSON.parse(text) as unknown);
        }
        return text;
      }),
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      runnerAbort.abort();
      try {
        await queue.stop();
      } catch (error) {
        if (!isAbortError(error)) throw error;
      }
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
