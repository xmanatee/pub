import { type BridgeMessage } from "../../../../shared/bridge-protocol-core";
import { createClaudeCodeBridgeRunner } from "../bridge/providers/claude-code.js";
import { createClaudeSdkBridgeRunner } from "../bridge/providers/claude-sdk.js";
import { createOpenClawBridgeRunner } from "../bridge/providers/openclaw.js";
import { buildSessionBriefing } from "../bridge/shared.js";
import { writeLiveSessionContentFile } from "../runtime/daemon-files.js";
import { buildBridgeInstructions } from "./shared.js";
import type { DaemonState } from "./state.js";

export function createBridgeManager(params: {
  state: DaemonState;
  config: { bridgeMode: "openclaw" | "claude-code" | "claude-sdk"; bridgeConfig: any };
  commandHandler: {
    beginManifestLoad: () => void;
    bindFromHtml: (html: string) => void;
    clearBindings: () => void;
  };
  apiClient: { get: (slug: string) => Promise<{ title?: string; isPublic?: boolean; content?: string | null }> };
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  sendOutboundMessageWithAck: (
    channel: string,
    msg: BridgeMessage,
    options?: { binaryPayload?: Buffer; context?: string; maxAttempts?: number },
  ) => Promise<boolean>;
  emitDeliveryStatus: (params: {
    channel: string;
    messageId: string;
    stage: "received" | "confirmed" | "failed";
    error?: string;
  }) => void;
}) {
  const {
    state,
    config,
    commandHandler,
    apiClient,
    debugLog,
    markError,
    sendOutboundMessageWithAck,
    emitDeliveryStatus,
  } = params;

  async function sendOnChannel(channel: string, msg: BridgeMessage): Promise<boolean> {
    if (state.stopped || !(state.browserConnected && state.bridgePrimed)) return false;
    return await sendOutboundMessageWithAck(channel, msg, {
      context: `bridge outbound on "${channel}"`,
      maxAttempts: 2,
    });
  }

  async function buildInitialSessionBriefing(params: {
    slug: string;
    instructions: ReturnType<typeof buildBridgeInstructions>;
  }): Promise<string> {
    commandHandler.beginManifestLoad();
    const pub = await apiClient.get(params.slug);
    const content = typeof pub.content === "string" ? pub.content : "";
    if (content.length > 0) commandHandler.bindFromHtml(content);
    else commandHandler.clearBindings();
    const canvasContentFilePath =
      content.length > 0
        ? writeLiveSessionContentFile({ slug: params.slug, content })
        : undefined;

    return buildSessionBriefing(
      params.slug,
      {
        title: pub.title,
        isPublic: pub.isPublic,
        canvasContentFilePath,
      },
      params.instructions,
    );
  }

  async function startBridge(slug: string): Promise<void> {
    if (state.stopped || state.activeSlug !== slug) return;
    await stopBridge();
    const abort = new AbortController();
    state.bridgeAbort = abort;
    const instructions = buildBridgeInstructions(config.bridgeMode);
    const sessionBriefing = await buildInitialSessionBriefing({ slug, instructions });
    const bridgeConfig = {
      slug,
      sessionBriefing,
      bridgeConfig: config.bridgeConfig,
      sendMessage: sendOnChannel,
      onDeliveryUpdate: ({
        channel,
        messageId,
        stage,
        error,
      }: {
        channel: string;
        messageId: string;
        stage: "confirmed" | "failed";
        error?: string;
      }) => {
        emitDeliveryStatus({ channel, messageId, stage, error });
      },
      debugLog,
      instructions,
    };

    const runner =
      config.bridgeMode === "claude-sdk"
        ? await createClaudeSdkBridgeRunner(bridgeConfig, abort.signal)
        : config.bridgeMode === "claude-code"
          ? await createClaudeCodeBridgeRunner(bridgeConfig, abort.signal)
          : await createOpenClawBridgeRunner(bridgeConfig);

    if (state.stopped || state.activeSlug !== slug || abort.signal.aborted) {
      await runner.stop();
      return;
    }
    state.bridgeRunner = runner;
  }

  async function ensureBridgePrimed(): Promise<void> {
    if (state.stopped || !state.browserConnected || state.bridgePrimed || state.bridgePriming || !state.activeSlug) {
      return;
    }

    const slug = state.activeSlug;
    const primePromise = (async () => {
      try {
        await startBridge(slug);
        if (state.stopped || !state.browserConnected || state.activeSlug !== slug) return;
        state.bridgePrimed = true;
        debugLog(`bridge primed for "${slug}"`);
      } catch (error) {
        state.bridgePrimed = false;
        markError(`failed to prime bridge session for "${slug}"`, error);
      } finally {
        state.bridgePriming = null;
      }
    })();

    state.bridgePriming = primePromise;
    await primePromise;
  }

  async function stopBridge(): Promise<void> {
    state.bridgePrimed = false;
    state.bridgePriming = null;
    if (state.bridgeAbort) {
      state.bridgeAbort.abort();
      state.bridgeAbort = null;
    }
    if (state.bridgeRunner) {
      await state.bridgeRunner.stop();
      state.bridgeRunner = null;
    }
  }

  return {
    ensureBridgePrimed,
    stopBridge,
  };
}
