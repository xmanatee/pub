import {
  type BridgeMessage,
  CONTROL_CHANNEL,
  makeErrorMessage,
} from "../../../../shared/bridge-protocol-core";
import { canSendAgentTraffic, isLiveConnectionReady } from "../../../../shared/live-runtime-state-core";
import type { BridgeSettings } from "../../core/config/index.js";
import { createBridgeRunnerForSettings } from "../bridge/providers/registry.js";
import { buildSessionBriefing } from "../bridge/shared.js";
import { writeLiveSessionContentFile } from "../runtime/daemon-files.js";
import { buildBridgeInstructions } from "./shared.js";
import { setDaemonAgentState, type DaemonState } from "./state.js";

const SLOW_AGENT_PREPARATION_LOG_MS = 10_000;

export function createBridgeManager(params: {
  state: DaemonState;
  bridgeSettings: BridgeSettings;
  commandHandler: {
    beginManifestLoad: () => void;
    bindFromHtml: (html: string) => void;
    clearBindings: () => void;
  };
  apiClient: {
    get: (slug: string) => Promise<{ title?: string; isPublic?: boolean; content?: string }>;
  };
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  sendOutboundMessageWithAck: (
    channel: string,
    msg: BridgeMessage,
    options?: { binaryPayload?: Buffer; context?: string; maxAttempts?: number },
  ) => Promise<boolean>;
  publishRuntimeState: (options?: {
    continued?: boolean;
    requireDelivery?: boolean;
  }) => Promise<boolean>;
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
    publishRuntimeState,
    emitDeliveryStatus,
  } = params;

  async function sendOnChannel(channel: string, msg: BridgeMessage): Promise<boolean> {
    if (state.stopped) return false;
    if (!canSendAgentTraffic(state.runtimeState)) {
      if (state.bridgeRunner && state.bridgeSlug && state.bridgeOutboundBuffer.length < 200) {
        state.bridgeOutboundBuffer.push({ channel, msg });
      }
      return false;
    }
    return sendOutboundMessageWithAck(channel, msg, {
      context: `bridge outbound on "${channel}"`,
      maxAttempts: 2,
    });
  }

  async function notifyBrowserPreparationFailed(slug: string, error: unknown): Promise<void> {
    await sendOutboundMessageWithAck(
      CONTROL_CHANNEL,
      makeErrorMessage({
        code: "AGENT_PREPARATION_FAILED",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : `Failed to prepare agent session for "${slug}"`,
      }),
      {
        context: 'bridge error status on "_control"',
        maxAttempts: 1,
      },
    ).catch((notifyError) => {
      debugLog(`failed to notify browser about preparation error for "${slug}"`, notifyError);
    });
  }

  async function loadSessionContent(slug: string): Promise<{
    content: string;
    isPublic?: boolean;
    title?: string;
  }> {
    debugLog(`bridge session content load start slug=${slug}`);
    commandHandler.beginManifestLoad();
    try {
      const pub = await apiClient.get(slug);
      const content = typeof pub.content === "string" ? pub.content : "";
      if (content.length > 0) commandHandler.bindFromHtml(content);
      else commandHandler.clearBindings();
      debugLog(`bridge session content load complete slug=${slug} contentBytes=${content.length}`);
      return {
        title: pub.title,
        isPublic: pub.isPublic,
        content,
      };
    } catch (error) {
      commandHandler.clearBindings();
      throw error;
    }
  }

  async function buildInitialSessionBriefing(params: {
    slug: string;
    instructions: ReturnType<typeof buildBridgeInstructions>;
  }): Promise<string> {
    const sessionContent = await loadSessionContent(params.slug);
    const canvasContentFilePath =
      sessionContent.content.length > 0
        ? writeLiveSessionContentFile({ slug: params.slug, content: sessionContent.content })
        : undefined;

    debugLog(
      `bridge briefing load complete slug=${params.slug} contentBytes=${sessionContent.content.length} hasCanvasFile=${String(Boolean(canvasContentFilePath))}`,
    );

    return buildSessionBriefing(
      params.slug,
      {
        title: sessionContent.title,
        isPublic: sessionContent.isPublic,
        canvasContentFilePath,
      },
      params.instructions,
    );
  }

  async function disposeBridge(options?: {
    clearPreparing?: boolean;
    publishRuntimeState?: boolean;
    resetAgentState?: boolean;
  }): Promise<void> {
    const shouldPublish =
      options?.publishRuntimeState !== false && isLiveConnectionReady(state.runtimeState);
    if (options?.resetAgentState !== false) {
      setDaemonAgentState(state, "idle");
    }
    if (options?.clearPreparing !== false) {
      state.agentPreparing = null;
    }
    state.bridgeSlug = null;
    state.bridgeOutboundBuffer.length = 0;
    if (state.bridgeAbort) {
      state.bridgeAbort.abort();
      state.bridgeAbort = null;
    }
    if (state.bridgeRunner) {
      await state.bridgeRunner.stop();
      state.bridgeRunner = null;
    }
    if (shouldPublish) {
      await publishRuntimeState().catch((error) => {
        debugLog("failed to publish idle agent state while stopping bridge", error);
      });
    }
  }

  async function startBridge(slug: string): Promise<void> {
    if (state.stopped || state.activeSlug !== slug) return;
    await disposeBridge({
      clearPreparing: false,
      publishRuntimeState: false,
      resetAgentState: false,
    });
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
    state.bridgeSlug = slug;
  }

  async function flushOutboundBuffer(): Promise<void> {
    const entries = state.bridgeOutboundBuffer.splice(0);
    for (const { channel, msg } of entries) {
      await sendOutboundMessageWithAck(channel, msg, {
        context: `bridge flush on "${channel}"`,
        maxAttempts: 2,
      });
    }
  }

  async function ensureAgentReady(): Promise<void> {
    const hasReusableRunner =
      state.bridgeRunner !== null &&
      state.activeSlug !== null &&
      state.bridgeSlug === state.activeSlug &&
      state.bridgeRunner.status().running;
    if (
      state.stopped ||
      !isLiveConnectionReady(state.runtimeState) ||
      state.agentPreparing ||
      !state.activeSlug
    ) {
      return;
    }

    const slug = state.activeSlug;

    if (state.bridgeRunner && state.bridgeSlug === slug) {
      if (state.bridgeRunner.status().running) {
        debugLog(`reattaching existing bridge for "${slug}"`);
        try {
          setDaemonAgentState(state, "ready");
          await loadSessionContent(slug);
          await publishRuntimeState({ continued: true, requireDelivery: true });
          await flushOutboundBuffer();
        } catch (error) {
          setDaemonAgentState(state, "idle");
          await publishRuntimeState().catch((publishError) => {
            debugLog(`failed to publish idle state after reattach error for "${slug}"`, publishError);
          });
          markError(`failed to reattach bridge for "${slug}"`, error);
        }
        return;
      }
      debugLog(`bridge for "${slug}" died during disconnect, restarting`);
      await stopBridge();
    }

    const isStale = () => state.stopped || state.activeSlug !== slug;

    const slowPreparationTimer = setTimeout(() => {
      if (
        state.agentPreparing &&
        state.activeSlug === slug &&
        isLiveConnectionReady(state.runtimeState) &&
        state.runtimeState.agentState !== "ready"
      ) {
        debugLog(
          `agent preparation still in progress slug=${slug} after ${SLOW_AGENT_PREPARATION_LOG_MS}ms`,
        );
      }
    }, SLOW_AGENT_PREPARATION_LOG_MS);

    const preparePromise = (async () => {
      try {
        const t0 = Date.now();
        setDaemonAgentState(state, "preparing");
        await publishRuntimeState().catch((error) => {
          debugLog(`failed to publish preparing state for "${slug}"`, error);
        });
        if (isStale()) return;
        debugLog(`agent preparation start slug=${slug}`);
        await startBridge(slug);
        debugLog(`[profile] bridge started in ${Date.now() - t0}ms`);
        if (isStale() || !isLiveConnectionReady(state.runtimeState)) return;
        setDaemonAgentState(state, "ready");
        const tReady = Date.now();
        await publishRuntimeState({ requireDelivery: true });
        if (isStale()) return;
        debugLog(`agent preparation complete slug=${slug} total=${Date.now() - t0}ms`);
        debugLog(
          `[profile] ready state sent in ${Date.now() - tReady}ms (total ${Date.now() - t0}ms)`,
        );
      } catch (error) {
        if (isStale()) return;
        setDaemonAgentState(state, "idle");
        await publishRuntimeState().catch((publishError) => {
          debugLog(`failed to publish idle state for "${slug}"`, publishError);
        });
        await notifyBrowserPreparationFailed(slug, error);
        await disposeBridge({
          clearPreparing: false,
          publishRuntimeState: false,
          resetAgentState: false,
        }).catch((stopError) => {
          debugLog(`failed to stop bridge after preparation error for "${slug}"`, stopError);
        });
        markError(`failed to prepare agent session for "${slug}"`, error);
      } finally {
        clearTimeout(slowPreparationTimer);
        if (!isStale()) {
          state.agentPreparing = null;
        }
      }
    })();

    state.agentPreparing = preparePromise;
    await preparePromise;
  }

  async function stopBridge(): Promise<void> {
    await disposeBridge();
  }

  function clearAgentPreparation(): void {
    state.agentPreparing = null;
  }

  return {
    clearAgentPreparation,
    ensureAgentReady,
    stopBridge,
  };
}
