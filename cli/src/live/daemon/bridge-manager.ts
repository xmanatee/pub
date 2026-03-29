import { randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  type BridgeMessage,
  CONTROL_CHANNEL,
  makeErrorMessage,
} from "../../../../shared/bridge-protocol-core";
import {
  canSendAgentTraffic,
  isLiveConnectionReady,
  type LiveAgentActivity,
} from "../../../../shared/live-runtime-state-core";
import type { PubApiClient } from "../../core/api/client.js";
import type { BridgeSettings } from "../../core/config/index.js";
import { createBridgeRunnerForSettings } from "../bridge/providers/registry.js";
import { buildSessionBriefing } from "../bridge/shared.js";
import {
  applyWorkspaceFiles,
  hydrateSessionWorkspace,
  readWorkspaceFiles,
  removeLiveSessionDirs,
  writeCanvasMirror,
} from "../runtime/daemon-files.js";
import { type DaemonState, setDaemonAgentActivity, setDaemonAgentState } from "./state.js";

const SLOW_AGENT_PREPARATION_LOG_MS = 10_000;

export function createBridgeManager(params: {
  state: DaemonState;
  bridgeSettings: BridgeSettings;
  commandHandler: {
    beginManifestLoad: () => void;
    bindFromHtml: (html: string) => void;
    clearBindings: () => void;
  };
  apiClient: Pick<PubApiClient, "get" | "update">;
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

  function handleActivityChange(activity: LiveAgentActivity): void {
    const prev = state.runtimeState.agentActivity;
    if (prev === activity) return;
    setDaemonAgentActivity(state, activity);
    void publishRuntimeState().catch((error) => {
      debugLog(`failed to publish activity=${activity}`, error);
    });
  }

  function markAgentStreaming(): void {
    if (state.runtimeState.agentActivity !== "thinking") return;
    handleActivityChange("streaming");
  }

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

  interface SessionContent {
    pubId: string;
    files: Record<string, string>;
    isPublic: boolean;
    title?: string;
    description?: string;
  }

  async function fetchSessionContent(slug: string): Promise<SessionContent> {
    debugLog(`bridge session content fetch start slug=${slug}`);
    const pub = await apiClient.get(slug);
    if (!pub.id) {
      throw new Error(`Pub API did not return an id for "${slug}".`);
    }
    const files = pub.files ?? {};
    const content = files["index.html"] ?? "";
    debugLog(
      `bridge session content fetch complete slug=${slug} fileCount=${Object.keys(files).length} contentBytes=${content.length}`,
    );
    return {
      pubId: pub.id,
      title: pub.title,
      description: pub.description,
      isPublic: pub.isPublic,
      files,
    };
  }

  function bindSessionManifest(content: string | undefined): void {
    commandHandler.beginManifestLoad();
    if (content && content.length > 0) commandHandler.bindFromHtml(content);
    else commandHandler.clearBindings();
  }

  async function loadSessionContent(slug: string): Promise<SessionContent> {
    commandHandler.beginManifestLoad();
    try {
      const sessionContent = await fetchSessionContent(slug);
      const indexHtml = sessionContent.files["index.html"];
      if (indexHtml && indexHtml.length > 0) commandHandler.bindFromHtml(indexHtml);
      else commandHandler.clearBindings();
      return sessionContent;
    } catch (error) {
      commandHandler.clearBindings();
      throw error;
    }
  }

  async function teardownBridgeRunner(): Promise<void> {
    const activeLiveSession = state.activeLiveSession;
    state.bridgeSlug = null;
    state.bridgeOutboundBuffer.length = 0;
    if (state.bridgeAbort) {
      state.bridgeAbort.abort();
      state.bridgeAbort = null;
    }
    if (state.bridgeRunner) {
      try {
        await state.bridgeRunner.stop();
      } catch (error) {
        debugLog("bridge runner stop failed", error);
      }
      state.bridgeRunner = null;
    }
    state.activeLiveSession = null;
    if (activeLiveSession) {
      try {
        removeLiveSessionDirs(activeLiveSession.liveSessionId);
      } catch (error) {
        debugLog(
          `failed to remove live session dirs for "${activeLiveSession.liveSessionId}"`,
          error,
        );
      }
    }
  }

  async function startBridge(slug: string): Promise<void> {
    if (state.stopped || state.signalingSlug !== slug) return;
    await teardownBridgeRunner();
    const abort = new AbortController();
    state.bridgeAbort = abort;
    debugLog(`bridge runner start slug=${slug}`);
    const sessionContent = await fetchSessionContent(slug);
    const liveSessionId = randomUUID();
    const sessionPaths = hydrateSessionWorkspace({
      liveSessionId,
      pubId: sessionContent.pubId,
      files: sessionContent.files,
    });
    state.activeLiveSession = {
      liveSessionId,
      pubId: sessionContent.pubId,
      workspaceCanvasDir: sessionPaths.workspaceCanvasDir,
      attachmentDir: sessionPaths.attachmentDir,
      artifactsDir: sessionPaths.artifactsDir,
    };
    const contentFilePath = path.join(sessionPaths.workspaceCanvasDir, "index.html");
    debugLog(
      `bridge briefing load complete slug=${slug} liveSessionId=${liveSessionId} fileCount=${Object.keys(sessionContent.files).length}`,
    );
    const sessionBriefing = buildSessionBriefing(slug, {
      title: sessionContent.title,
      description: sessionContent.description,
      isPublic: sessionContent.isPublic,
      contentFilePath: sessionContent.files["index.html"] ? contentFilePath : undefined,
      workspaceDir: sessionPaths.workspaceCanvasDir,
    });

    const runnerBridgeSettingsBase: BridgeSettings = {
      ...bridgeSettings,
      workspaceDir: sessionPaths.workspaceCanvasDir,
      attachmentDir: sessionPaths.attachmentDir,
      artifactsDir: sessionPaths.artifactsDir,
    };
    const runnerBridgeSettings = state.activeLiveModelProfile
      ? { ...runnerBridgeSettingsBase, liveModelProfile: state.activeLiveModelProfile }
      : runnerBridgeSettingsBase;
    const runnerConfig = {
      slug,
      sessionBriefing,
      bridgeSettings: runnerBridgeSettings,
      sendMessage: sendOnChannel,
      onActivityChange: handleActivityChange,
      onCanvasWrite: (html: string) => {
        void persistCanvasHtml(html).catch((error) => {
          markError("unexpected canvas persist failure", error);
        });
      },
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
    };

    const runner = await createBridgeRunnerForSettings({
      bridgeSettings: runnerBridgeSettings,
      config: runnerConfig,
      abortSignal: abort.signal,
    });
    debugLog(`bridge runner created slug=${slug}`);

    if (state.stopped || state.signalingSlug !== slug || abort.signal.aborted) {
      await runner.stop();
      return;
    }
    state.bridgeRunner = runner;
    state.bridgeSlug = slug;

    // Bind the manifest NOW — bridge runner is set, so agent commands will resolve.
    bindSessionManifest(sessionContent.files["index.html"]);
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
    if (
      state.stopped ||
      !isLiveConnectionReady(state.runtimeState) ||
      state.agentPreparing ||
      !state.signalingSlug
    ) {
      return;
    }

    const slug = state.signalingSlug;

    if (state.bridgeRunner && state.bridgeSlug === slug) {
      if (state.bridgeRunner.status().running) {
        debugLog(`reattaching existing bridge for "${slug}"`);
        try {
          setDaemonAgentState(state, "ready");
          await loadSessionContent(slug);
          await publishRuntimeState({ continued: true, requireDelivery: true });
          await flushOutboundBuffer();
        } catch (error) {
          setDaemonAgentActivity(state, "idle");
          setDaemonAgentState(state, "idle");
          await publishRuntimeState().catch((publishError) => {
            debugLog(
              `failed to publish idle state after reattach error for "${slug}"`,
              publishError,
            );
          });
          markError(`failed to reattach bridge for "${slug}"`, error);
        }
        return;
      }
      debugLog(`bridge for "${slug}" died during disconnect, restarting`);
      await stopBridge();
    }

    const isStale = () => state.stopped || state.signalingSlug !== slug;

    const slowPreparationTimer = setTimeout(() => {
      if (
        state.agentPreparing &&
        state.signalingSlug === slug &&
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
        setDaemonAgentActivity(state, "idle");
        setDaemonAgentState(state, "idle");
        await publishRuntimeState().catch((publishError) => {
          debugLog(`failed to publish idle state for "${slug}"`, publishError);
        });
        await notifyBrowserPreparationFailed(slug, error);
        await teardownBridgeRunner().catch((stopError) => {
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
    setDaemonAgentActivity(state, "idle");
    setDaemonAgentState(state, "idle");
    state.agentPreparing = null;
    await teardownBridgeRunner();
  }

  async function persistCanvasHtml(html: string): Promise<Record<string, unknown>> {
    const slug = state.bridgeSlug;
    const activeLiveSession = state.activeLiveSession;
    if (!slug || !activeLiveSession) return { ok: false, error: "No active live session." };
    try {
      const files = applyWorkspaceFiles(activeLiveSession.workspaceCanvasDir, {
        "index.html": html,
      });
      await publishWorkspaceFiles(slug, activeLiveSession, files);
      commandHandler.bindFromHtml(html);
      return { ok: true, delivered: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      markError(`failed to persist canvas HTML for "${slug}"`, error);
      return { ok: false, error: `Canvas update failed: ${errMsg}` };
    }
  }

  async function persistFiles(files: Record<string, string>): Promise<Record<string, unknown>> {
    const slug = state.bridgeSlug;
    const activeLiveSession = state.activeLiveSession;
    if (!slug || !activeLiveSession) return { ok: false, error: "No active live session." };
    try {
      const snapshot = applyWorkspaceFiles(activeLiveSession.workspaceCanvasDir, files);
      await publishWorkspaceFiles(slug, activeLiveSession, snapshot);
      const indexHtml = snapshot["index.html"];
      if (indexHtml) commandHandler.bindFromHtml(indexHtml);
      return { ok: true, fileCount: Object.keys(snapshot).length };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      markError(`failed to write files for "${slug}"`, error);
      return { ok: false, error: `File write failed: ${errMsg}` };
    }
  }

  async function publishWorkspaceFiles(
    slug: string,
    activeLiveSession: NonNullable<DaemonState["activeLiveSession"]>,
    files = readWorkspaceFiles(activeLiveSession.workspaceCanvasDir),
  ): Promise<Record<string, string>> {
    await apiClient.update({ slug, files });
    writeCanvasMirror(activeLiveSession.pubId, files);
    return files;
  }

  function clearAgentPreparation(): void {
    state.agentPreparing = null;
  }

  return {
    clearAgentPreparation,
    ensureAgentReady,
    markAgentStreaming,
    persistCanvasHtml,
    persistFiles,
    stopBridge,
  };
}
