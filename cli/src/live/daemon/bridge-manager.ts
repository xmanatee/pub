import {
  type BridgeMessage,
  CONTROL_CHANNEL,
  makeErrorMessage,
  makeStatusMessage,
} from "../../../../shared/bridge-protocol-core";
import type { BridgeSettings } from "../../core/config/index.js";
import { createBridgeRunnerForSettings } from "../bridge/providers/registry.js";
import { buildSessionBriefing } from "../bridge/shared.js";
import { writeLiveSessionContentFile } from "../runtime/daemon-files.js";
import { buildBridgeInstructions } from "./shared.js";
import type { DaemonState } from "./state.js";

const SLOW_BRIDGE_PRIMING_LOG_MS = 10_000;

export function createBridgeManager(params: {
  state: DaemonState;
  bridgeSettings: BridgeSettings;
  commandHandler: {
    beginManifestLoad: () => void;
    bindFromHtml: (html: string) => void;
    clearBindings: () => void;
  };
  apiClient: {
    get: (slug: string) => Promise<{ title?: string; isPublic?: boolean; content?: string | null }>;
  };
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
    bridgeSettings,
    commandHandler,
    apiClient,
    debugLog,
    markError,
    sendOutboundMessageWithAck,
    emitDeliveryStatus,
  } = params;

  async function sendOnChannel(channel: string, msg: BridgeMessage): Promise<boolean> {
    if (state.stopped || !(state.browserConnected && state.bridgePrimed)) return false;
    return sendOutboundMessageWithAck(channel, msg, {
      context: `bridge outbound on "${channel}"`,
      maxAttempts: 2,
    });
  }

  async function notifyBrowserReady(slug: string): Promise<void> {
    const delivered = await sendOutboundMessageWithAck(
      CONTROL_CHANNEL,
      makeStatusMessage({
        connected: true,
        ready: true,
        slug,
        channels: [...state.channels.keys()],
      }),
      {
        context: 'bridge ready status on "_control"',
        maxAttempts: 2,
      },
    );

    if (!delivered) {
      throw new Error(`Failed to deliver ready status for "${slug}"`);
    }
  }

  async function notifyBrowserPrimeFailed(slug: string, error: unknown): Promise<void> {
    await sendOutboundMessageWithAck(
      CONTROL_CHANNEL,
      makeErrorMessage({
        code: "BRIDGE_PRIME_FAILED",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : `Failed to prime bridge session for "${slug}"`,
      }),
      {
        context: 'bridge error status on "_control"',
        maxAttempts: 1,
      },
    ).catch((notifyError) => {
      debugLog(`failed to notify browser about priming error for "${slug}"`, notifyError);
    });
  }

  async function buildInitialSessionBriefing(params: {
    slug: string;
    instructions: ReturnType<typeof buildBridgeInstructions>;
  }): Promise<string> {
    debugLog(`bridge briefing load start slug=${params.slug}`);
    commandHandler.beginManifestLoad();
    const pub = await apiClient.get(params.slug);
    const content = typeof pub.content === "string" ? pub.content : "";
    if (content.length > 0) commandHandler.bindFromHtml(content);
    else commandHandler.clearBindings();
    const canvasContentFilePath =
      content.length > 0 ? writeLiveSessionContentFile({ slug: params.slug, content }) : undefined;

    debugLog(
      `bridge briefing load complete slug=${params.slug} contentBytes=${content.length} hasCanvasFile=${String(Boolean(canvasContentFilePath))}`,
    );

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
    debugLog(`bridge runner start slug=${slug}`);
    const instructions = buildBridgeInstructions();
    const sessionBriefing = await buildInitialSessionBriefing({ slug, instructions });
    const runnerBridgeSettings = state.activeLiveModelProfile
      ? { ...bridgeSettings, liveModelProfile: state.activeLiveModelProfile }
      : bridgeSettings;
    const runnerConfig = {
      slug,
      sessionBriefing,
      bridgeSettings: runnerBridgeSettings,
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

    const runner = await createBridgeRunnerForSettings({
      bridgeSettings: runnerBridgeSettings,
      config: runnerConfig,
      abortSignal: abort.signal,
    });
    debugLog(`bridge runner created slug=${slug}`);

    if (state.stopped || state.activeSlug !== slug || abort.signal.aborted) {
      await runner.stop();
      return;
    }
    state.bridgeRunner = runner;
  }

  async function ensureBridgePrimed(): Promise<void> {
    if (
      state.stopped ||
      !state.browserConnected ||
      state.bridgePrimed ||
      state.bridgePriming ||
      !state.activeSlug
    ) {
      return;
    }

    const slug = state.activeSlug;
    const slowPrimingTimer = setTimeout(() => {
      if (
        state.bridgePriming &&
        state.activeSlug === slug &&
        state.browserConnected &&
        !state.bridgePrimed
      ) {
        debugLog(
          `bridge priming still in progress slug=${slug} after ${SLOW_BRIDGE_PRIMING_LOG_MS}ms`,
        );
      }
    }, SLOW_BRIDGE_PRIMING_LOG_MS);
    const primePromise = (async () => {
      try {
        const t0 = Date.now();
        debugLog(`bridge priming start slug=${slug}`);
        await startBridge(slug);
        debugLog(`[profile] bridge started in ${Date.now() - t0}ms`);
        if (state.stopped || !state.browserConnected || state.activeSlug !== slug) return;
        state.bridgePrimed = true;
        const tReady = Date.now();
        await notifyBrowserReady(slug);
        debugLog(`bridge priming complete slug=${slug} total=${Date.now() - t0}ms`);
        debugLog(
          `[profile] ready sent in ${Date.now() - tReady}ms (total prime ${Date.now() - t0}ms)`,
        );
      } catch (error) {
        state.bridgePrimed = false;
        await notifyBrowserPrimeFailed(slug, error);
        await stopBridge().catch((stopError) => {
          debugLog(`failed to stop bridge after priming error for "${slug}"`, stopError);
        });
        markError(`failed to prime bridge session for "${slug}"`, error);
      } finally {
        clearTimeout(slowPrimingTimer);
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
