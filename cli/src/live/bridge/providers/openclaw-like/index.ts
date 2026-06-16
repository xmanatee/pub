import { createBridgeScaffolding } from "../../scaffolding.js";
import {
  type BridgeCapabilities,
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  prependSystemPrompt,
} from "../../shared.js";
import { deliverMessageToCommand, resolveOpenClawLikeProfileInvocation } from "./runtime.js";

export { runOpenClawLikeBridgeStartupProbe } from "./probe.js";

const CAPABILITIES: BridgeCapabilities = { conversational: true };

export async function createOpenClawLikeBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "openclaw-like") {
    throw new Error("openclaw-like runtime is not prepared.");
  }
  const { debugLog, sessionBriefing } = config;
  const bridgeSettings = config.bridgeSettings;
  const invocation = resolveOpenClawLikeProfileInvocation(
    bridgeSettings,
    bridgeSettings.liveProfileId,
  );

  let stopped = false;

  await deliverMessageToCommand(
    { command: invocation.command, args: invocation.args, text: sessionBriefing },
    process.env,
    bridgeSettings,
  );
  debugLog(`session briefing delivered profile=${invocation.profileId}`);

  async function deliver(prompt: string): Promise<void> {
    const reply = await deliverMessageToCommand(
      { command: invocation.command, args: invocation.args, text: prependSystemPrompt(prompt) },
      process.env,
      bridgeSettings,
    );
    await scaffold.sendChatText(reply);
  }

  const scaffold = createBridgeScaffolding(config, deliver);

  return {
    capabilities: CAPABILITIES,
    enqueue: (entries) => scaffold.queue.enqueue(entries),
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      await scaffold.queue.stop();
    },
    status(): BridgeStatus {
      return {
        running: !stopped,
        ...scaffold.status(),
      };
    },
  };
}
