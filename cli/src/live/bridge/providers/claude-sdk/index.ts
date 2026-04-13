import { errorMessage } from "../../../../core/errors/cli-error.js";
import { createBridgeScaffolding } from "../../scaffolding.js";
import { createSessionTaskQueue } from "../../session-task-queue.js";
import type {
  BridgeCapabilities,
  BridgeRunner,
  BridgeRunnerConfig,
  BridgeStatus,
} from "../../shared.js";
import { readSdkAssistantText } from "./event-reader.js";
import { buildSdkSessionOptionsFromSettings, loadClaudeSdk } from "./runtime.js";

export {
  buildSdkSessionOptions,
  isClaudeSdkAvailableInEnv,
} from "./discovery.js";
export { runClaudeSdkBridgeStartupProbe } from "./probe.js";
export { buildSdkSessionOptionsFromSettings } from "./runtime.js";

const MAX_SESSION_RECREATIONS = 2;

const CAPABILITIES: BridgeCapabilities = { conversational: true };

export async function createClaudeSdkBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "claude-sdk") {
    throw new Error("Claude SDK runtime is not prepared.");
  }
  const { debugLog, sessionBriefing } = config;

  const loadedSdk = loadClaudeSdk();
  const { model, claudePath, workspaceDir, sdkEnv } = buildSdkSessionOptionsFromSettings(
    config.bridgeSettings,
    process.env,
  );

  let sessionId: string | undefined;
  let stopped = abortSignal?.aborted ?? false;
  let sessionRecreations = 0;
  const queueSessionTask = createSessionTaskQueue();

  type SdkSession = ReturnType<typeof loadedSdk.unstable_v2_createSession>;
  let activeSession: SdkSession | null = null;

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        stopped = true;
        activeSession?.close();
      },
      { once: true },
    );
  }

  function createSession(): SdkSession {
    const session = loadedSdk.unstable_v2_createSession({
      model,
      pathToClaudeCodeExecutable: claudePath,
      env: sdkEnv,
      canUseTool: async (_tool, input) => ({ behavior: "allow" as const, updatedInput: input }),
      ...(workspaceDir ? ({ cwd: workspaceDir } as Record<string, unknown>) : {}),
    } as Parameters<typeof loadedSdk.unstable_v2_createSession>[0]);
    activeSession = session;
    return session;
  }

  async function consumeStream(session: SdkSession): Promise<string> {
    let collected = "";
    for await (const msg of session.stream()) {
      if (stopped) break;
      const text = readSdkAssistantText(msg);
      if (text.length > 0) collected += text;
      if (msg.type === "result") {
        if ("session_id" in msg && typeof msg.session_id === "string") {
          sessionId = msg.session_id;
          debugLog(`captured session_id: ${sessionId}`);
        }
        if (msg.subtype !== "success") {
          throw new Error(`Claude SDK result error: ${msg.subtype}`);
        }
      }
    }
    return collected.trim();
  }

  async function sendAndStream(session: SdkSession, prompt: string): Promise<string> {
    await session.send(prompt);
    return await consumeStream(session);
  }

  async function deliverWithRecovery(prompt: string): Promise<string> {
    if (stopped) return "";

    try {
      if (!activeSession) throw new Error("session not initialized");
      return await sendAndStream(activeSession, prompt);
    } catch (error) {
      debugLog(`session error: ${errorMessage(error)}`, error);
      if (stopped || sessionRecreations >= MAX_SESSION_RECREATIONS) throw error;

      sessionRecreations += 1;
      activeSession?.close();

      const newSession = createSession();
      await sendAndStream(newSession, sessionBriefing);
      return await sendAndStream(newSession, prompt);
    }
  }

  async function deliver(prompt: string): Promise<void> {
    const reply = await queueSessionTask(() => deliverWithRecovery(prompt));
    await scaffold.sendChatText(reply);
  }

  const scaffold = createBridgeScaffolding(config, deliver);

  await sendAndStream(createSession(), sessionBriefing);

  return {
    capabilities: CAPABILITIES,
    enqueue: (entries) => scaffold.queue.enqueue(entries),
    invokeAgentCommand: async ({ prompt, output }) =>
      await queueSessionTask(async () => {
        const text = await deliverWithRecovery(prompt);
        if (output === "json") {
          const trimmed = text.trim();
          return trimmed.length === 0 ? {} : (JSON.parse(trimmed) as unknown);
        }
        return text;
      }),
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      await scaffold.queue.stop();
      activeSession?.close();
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
