import { createBridgeScaffolding } from "../../scaffolding.js";
import { createSessionTaskQueue } from "../../session-task-queue.js";
import type {
  BridgeCapabilities,
  BridgeRunner,
  BridgeRunnerConfig,
  BridgeStatus,
} from "../../shared.js";
import { invokeOpenClawPrompt } from "./runtime.js";

export { isOpenClawAvailable } from "./discovery.js";
export { runOpenClawBridgeStartupProbe } from "./probe.js";

function buildBridgeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PUB_DAEMON_MODE;
  return env;
}

const CAPABILITIES: BridgeCapabilities = { conversational: true };

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function createOpenClawBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "openclaw") {
    throw new Error("OpenClaw runtime is not prepared.");
  }
  const { debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;
  const bridgeEnv = buildBridgeEnv();

  const openclawPath = bridgeSettings.openclawPath;
  const sessionId = bridgeSettings.sessionId;
  const useLocal = bridgeEnv.OPENCLAW_LOCAL === "1";

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

  async function runPrompt(
    prompt: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<string> {
    if (stopped) return "";
    try {
      return await invokeOpenClawPrompt({
        openclawPath,
        sessionId,
        text: prompt,
        workspaceDir: bridgeSettings.workspaceDir,
        env: bridgeEnv,
        local: useLocal,
        signal: signal ?? runnerAbort.signal,
        timeoutMs,
      });
    } catch (error) {
      if (stopped && isAbortError(error)) return "";
      throw error;
    }
  }

  async function deliver(prompt: string): Promise<void> {
    const reply = await queueSessionTask(() => runPrompt(prompt));
    await scaffold.sendChatText(reply);
  }

  const scaffold = createBridgeScaffolding(config, deliver);

  debugLog(`openclaw session briefing start slug=${config.slug} sessionId=${sessionId}`);
  await runPrompt(sessionBriefing);
  debugLog(`openclaw session briefing complete slug=${config.slug} sessionId=${sessionId}`);

  return {
    capabilities: CAPABILITIES,
    enqueue: (entries) => scaffold.queue.enqueue(entries),
    invokeAgentCommand: async ({ prompt, output, signal, timeoutMs }) =>
      await queueSessionTask(async () => {
        const taskAbort = new AbortController();
        const abortTask = () => taskAbort.abort();
        runnerAbort.signal.addEventListener("abort", abortTask, { once: true });
        signal.addEventListener("abort", abortTask, { once: true });
        try {
          const text = await runPrompt(prompt, taskAbort.signal, timeoutMs);
          if (output === "json") {
            return text.length === 0 ? {} : (JSON.parse(text) as unknown);
          }
          return text;
        } finally {
          runnerAbort.signal.removeEventListener("abort", abortTask);
          signal.removeEventListener("abort", abortTask);
        }
      }),
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      runnerAbort.abort();
      await scaffold.queue.stop();
    },
    status(): BridgeStatus {
      return {
        running: !stopped,
        sessionId,
        ...scaffold.status(),
      };
    },
  };
}
