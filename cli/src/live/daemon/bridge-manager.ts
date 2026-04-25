import { randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  type BridgeMessage,
  CONTROL_CHANNEL,
  makeErrorMessage,
} from "../../../../shared/bridge-protocol-core";
import type { LiveModelProfile } from "../../../../shared/live-model-profile";
import {
  canSendAgentTraffic,
  isLiveConnectionReady,
  type LiveAgentActivity,
} from "../../../../shared/live-runtime-state-core";
import type { PubApiClient } from "../../core/api/client.js";
import type { BridgeSettings } from "../../core/config/index.js";
import { createBridgeRunnerForSettings } from "../bridge/providers/registry.js";
import {
  type BufferedEntry,
  buildSessionBriefing,
  buildTunnelSessionBriefing,
} from "../bridge/shared.js";
import {
  applyWorkspaceFiles,
  ensureTunnelSessionDirs,
  hydrateSessionWorkspace,
  readWorkspaceFiles,
  removeLiveSessionDirs,
  writeCanvasMirror,
} from "../runtime/daemon-files.js";
import {
  type ActiveSession,
  type DaemonState,
  setDaemonAgentActivity,
  setDaemonAgentState,
} from "./state.js";

const SLOW_AGENT_PREPARATION_LOG_MS = 10_000;
const MAX_BRIDGE_BUFFER_SIZE = 200;

/** What ensureAgentReady is being asked to make true. The bridge-manager
 *  reconciles `state.activeSession` to match this intent, and decides whether
 *  to reattach (matching active session, runner alive) or restart. */
export type SessionIntent =
  | { kind: "pub"; slug: string; modelProfile: LiveModelProfile | null }
  | { kind: "tunnel"; workspaceDir: string };

function intentMatchesSession(intent: SessionIntent, session: ActiveSession): boolean {
  if (intent.kind === "pub" && session.kind === "pub") {
    return intent.slug === session.slug;
  }
  if (intent.kind === "tunnel" && session.kind === "tunnel") {
    return intent.workspaceDir === session.workspaceCanvasDir;
  }
  return false;
}

function describeIntent(intent: SessionIntent): string {
  return intent.kind === "pub" ? `pub:${intent.slug}` : `tunnel:${intent.workspaceDir}`;
}

export function createBridgeManager(params: {
  state: DaemonState;
  bridgeSettings: BridgeSettings;
  agentName?: string;
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
    agentName,
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
      if (state.bridgeRunner && state.bridgeOutboundBuffer.length < MAX_BRIDGE_BUFFER_SIZE) {
        state.bridgeOutboundBuffer.push({ channel, msg });
      }
      return false;
    }
    return sendOutboundMessageWithAck(channel, msg, {
      context: `bridge outbound on "${channel}"`,
      maxAttempts: 2,
    });
  }

  async function notifyBrowserPreparationFailed(
    intent: SessionIntent,
    error: unknown,
  ): Promise<void> {
    await sendOutboundMessageWithAck(
      CONTROL_CHANNEL,
      makeErrorMessage({
        code: "AGENT_PREPARATION_FAILED",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : `Failed to prepare agent session for ${describeIntent(intent)}`,
      }),
      {
        context: 'bridge error status on "_control"',
        maxAttempts: 1,
      },
    ).catch((notifyError) => {
      debugLog(
        `failed to notify browser about preparation error for ${describeIntent(intent)}`,
        notifyError,
      );
    });
  }

  interface PubSessionContent {
    pubId: string;
    files: Record<string, string>;
    isPublic: boolean;
    title?: string;
    description?: string;
  }

  async function fetchPubSessionContent(slug: string): Promise<PubSessionContent> {
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

  function bindManifestForSession(session: ActiveSession, indexHtml: string | undefined): void {
    if (session.kind !== "pub") {
      // Tunnel sessions don't carry a pub command manifest — the agent edits a
      // user-owned project tree, not a manifest-bearing HTML artifact.
      commandHandler.clearBindings();
      return;
    }
    commandHandler.beginManifestLoad();
    if (indexHtml && indexHtml.length > 0) commandHandler.bindFromHtml(indexHtml);
    else commandHandler.clearBindings();
  }

  async function reloadPubSessionContent(slug: string): Promise<PubSessionContent> {
    commandHandler.beginManifestLoad();
    try {
      const sessionContent = await fetchPubSessionContent(slug);
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
    const previousSession = state.activeSession;
    state.activeSession = null;
    state.bridgeOutboundBuffer.length = 0;
    // Inbound buffer is intentionally NOT cleared here. Teardown runs at the
    // start of every new preparation; the buffer holds messages the user has
    // already sent to "the agent on this connection," and we want them to
    // reach whichever runner ends up taking over. Failure paths clear the
    // buffer explicitly via failBufferedInbound.
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
    // Pub sessions own a per-session workspace tree; tear it down so the next
    // pub session starts clean. Tunnel sessions point at user-owned source —
    // never delete it.
    if (previousSession?.kind === "pub") {
      try {
        removeLiveSessionDirs(previousSession.liveSessionId);
      } catch (error) {
        debugLog(
          `failed to remove live session dirs for "${previousSession.liveSessionId}"`,
          error,
        );
      }
    }
  }

  function withRuntimeBridgeSettings(session: ActiveSession): BridgeSettings {
    const base: BridgeSettings = {
      ...bridgeSettings,
      workspaceDir: session.workspaceCanvasDir,
      attachmentDir: session.attachmentDir,
      artifactsDir: session.artifactsDir,
    };
    if (session.kind === "pub" && state.signalingModelProfile) {
      return { ...base, liveModelProfile: state.signalingModelProfile };
    }
    return base;
  }

  function buildBriefingFor(intent: SessionIntent, content: PubSessionContent | null): string {
    if (intent.kind === "pub") {
      if (!content) throw new Error("pub intent requires pre-fetched session content");
      const session = state.activeSession;
      if (!session || session.kind !== "pub") {
        throw new Error("pub intent requires an active pub session");
      }
      const indexHtml = content.files["index.html"];
      const contentFilePath = indexHtml
        ? path.join(session.workspaceCanvasDir, "index.html")
        : undefined;
      return buildSessionBriefing(session.slug, {
        title: content.title,
        description: content.description,
        isPublic: content.isPublic,
        contentFilePath,
        workspaceDir: session.workspaceCanvasDir,
      });
    }
    return buildTunnelSessionBriefing({
      workspaceDir: intent.workspaceDir,
      agentName: agentName ?? null,
    });
  }

  async function startSession(
    intent: SessionIntent,
    abort: AbortController,
    isStale: () => boolean,
  ): Promise<void> {
    debugLog(`bridge runner start ${describeIntent(intent)}`);

    if (intent.kind === "pub") {
      const content = await fetchPubSessionContent(intent.slug);
      if (isStale() || abort.signal.aborted) return;
      const liveSessionId = randomUUID();
      const dirs = hydrateSessionWorkspace({
        liveSessionId,
        pubId: content.pubId,
        files: content.files,
      });
      state.activeSession = {
        kind: "pub",
        slug: intent.slug,
        pubId: content.pubId,
        liveSessionId,
        workspaceCanvasDir: dirs.workspaceCanvasDir,
        attachmentDir: dirs.attachmentDir,
        artifactsDir: dirs.artifactsDir,
      };
      debugLog(
        `bridge briefing load complete slug=${intent.slug} liveSessionId=${liveSessionId} fileCount=${Object.keys(content.files).length}`,
      );
      const briefing = buildBriefingFor(intent, content);
      const runtimeSettings = withRuntimeBridgeSettings(state.activeSession);
      const runner = await createBridgeRunnerForSettings({
        bridgeSettings: runtimeSettings,
        config: {
          slug: intent.slug,
          sessionBriefing: briefing,
          bridgeSettings: runtimeSettings,
          sendMessage: sendOnChannel,
          onActivityChange: handleActivityChange,
          onCanvasWrite: (html: string) => {
            void persistCanvasHtml(html).catch((error) => {
              markError("unexpected canvas persist failure", error);
            });
          },
          onDeliveryUpdate: emitDeliveryStatus,
          debugLog,
        },
        abortSignal: abort.signal,
      });
      if (isStale() || abort.signal.aborted) {
        await runner.stop();
        return;
      }
      state.bridgeRunner = runner;
      bindManifestForSession(state.activeSession, content.files["index.html"]);
      return;
    }

    // tunnel kind
    const dirs = ensureTunnelSessionDirs({ workspaceDir: intent.workspaceDir });
    state.activeSession = {
      kind: "tunnel",
      workspaceCanvasDir: dirs.workspaceCanvasDir,
      attachmentDir: dirs.attachmentDir,
      artifactsDir: dirs.artifactsDir,
    };
    debugLog(`bridge briefing load complete tunnel workspaceDir=${dirs.workspaceCanvasDir}`);
    const briefing = buildBriefingFor(intent, null);
    const runtimeSettings = withRuntimeBridgeSettings(state.activeSession);
    const tunnelRunner = await createBridgeRunnerForSettings({
      bridgeSettings: runtimeSettings,
      config: {
        // Tunnel sessions surface a stable label for log/correlation; the bridge
        // protocol uses `slug` as the session identifier even though tunnel
        // mode has no Convex slug.
        slug: "(tunnel)",
        sessionBriefing: briefing,
        bridgeSettings: runtimeSettings,
        sendMessage: sendOnChannel,
        onActivityChange: handleActivityChange,
        onDeliveryUpdate: emitDeliveryStatus,
        debugLog,
      },
      abortSignal: abort.signal,
    });
    if (isStale() || abort.signal.aborted) {
      await tunnelRunner.stop();
      return;
    }
    state.bridgeRunner = tunnelRunner;
    bindManifestForSession(state.activeSession, undefined);
  }

  function drainInboundBuffer(): void {
    if (!state.bridgeRunner) return;
    const entries = state.bridgeInboundBuffer.splice(0);
    if (entries.length > 0) state.bridgeRunner.enqueue(entries);
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

  async function ensureAgentReady(intent: SessionIntent): Promise<void> {
    if (state.stopped || !isLiveConnectionReady(state.runtimeState)) return;

    // Increment first so any in-flight preparation sees a stale generation and
    // bails out at its next checkpoint. This is what makes pub↔tunnel handoff
    // safe: the previous intent's network calls finish but their post-await
    // state mutations are skipped.
    const myGen = ++state.bridgePrepGeneration;
    const isStale = () => state.stopped || myGen !== state.bridgePrepGeneration;

    if (state.bridgeAbort) state.bridgeAbort.abort();
    const previous = state.agentPreparing;

    const myAbort = new AbortController();

    const myPrep = runPreparation({
      intent,
      isStale,
      myAbort,
      previous,
    });

    state.agentPreparing = myPrep;
    await myPrep;
  }

  async function runPreparation(args: {
    intent: SessionIntent;
    isStale: () => boolean;
    myAbort: AbortController;
    previous: Promise<void> | null;
  }): Promise<void> {
    const { intent, isStale, myAbort, previous } = args;

    // Wait for any in-flight prep to settle. We swallow its rejection — the
    // previous owner already logged it via markError; we only need to know
    // when the lane is free.
    if (previous) await previous.catch(() => {});
    if (isStale()) return;

    if (
      state.activeSession &&
      intentMatchesSession(intent, state.activeSession) &&
      state.bridgeRunner?.status().running
    ) {
      debugLog(`reattaching existing bridge for ${describeIntent(intent)}`);
      try {
        setDaemonAgentState(state, "ready");
        if (intent.kind === "pub") {
          await reloadPubSessionContent(intent.slug);
        }
        if (isStale()) return;
        await publishRuntimeState({ continued: true, requireDelivery: true });
        await flushOutboundBuffer();
        drainInboundBuffer();
      } catch (error) {
        if (isStale()) return;
        setDaemonAgentActivity(state, "idle");
        setDaemonAgentState(state, "idle");
        await publishRuntimeState().catch((publishError) => {
          debugLog(
            `failed to publish idle state after reattach error for ${describeIntent(intent)}`,
            publishError,
          );
        });
        markError(`failed to reattach bridge for ${describeIntent(intent)}`, error);
      } finally {
        if (!isStale()) {
          state.agentPreparing = null;
          state.bridgeAbort = null;
        }
      }
      return;
    }

    const slowPreparationTimer = setTimeout(() => {
      if (
        !isStale() &&
        isLiveConnectionReady(state.runtimeState) &&
        state.runtimeState.agentState !== "ready"
      ) {
        debugLog(
          `agent preparation still in progress ${describeIntent(intent)} after ${SLOW_AGENT_PREPARATION_LOG_MS}ms`,
        );
      }
    }, SLOW_AGENT_PREPARATION_LOG_MS);

    try {
      const t0 = Date.now();
      setDaemonAgentState(state, "preparing");
      await publishRuntimeState().catch((error) => {
        debugLog(`failed to publish preparing state for ${describeIntent(intent)}`, error);
      });
      if (isStale()) return;
      debugLog(`agent preparation start ${describeIntent(intent)}`);
      await teardownBridgeRunner();
      if (isStale()) return;
      // teardownBridgeRunner aborts whatever was in state.bridgeAbort. Install
      // ours afterwards so the runner we're about to create is governed by an
      // un-aborted controller.
      state.bridgeAbort = myAbort;
      await startSession(intent, myAbort, isStale);
      debugLog(`[profile] bridge started in ${Date.now() - t0}ms`);
      if (isStale() || !isLiveConnectionReady(state.runtimeState)) return;
      setDaemonAgentState(state, "ready");
      const tReady = Date.now();
      await publishRuntimeState({ requireDelivery: true });
      if (isStale()) return;
      await flushOutboundBuffer();
      drainInboundBuffer();
      debugLog(`agent preparation complete ${describeIntent(intent)} total=${Date.now() - t0}ms`);
      debugLog(
        `[profile] ready state sent in ${Date.now() - tReady}ms (total ${Date.now() - t0}ms)`,
      );
    } catch (error) {
      if (isStale()) return;
      setDaemonAgentActivity(state, "idle");
      setDaemonAgentState(state, "idle");
      await publishRuntimeState().catch((publishError) => {
        debugLog(`failed to publish idle state for ${describeIntent(intent)}`, publishError);
      });
      await notifyBrowserPreparationFailed(intent, error);
      await teardownBridgeRunner().catch((stopError) => {
        debugLog(
          `failed to stop bridge after preparation error for ${describeIntent(intent)}`,
          stopError,
        );
      });
      failBufferedInbound(`agent preparation failed for ${describeIntent(intent)}`);
      markError(`failed to prepare agent session for ${describeIntent(intent)}`, error);
    } finally {
      clearTimeout(slowPreparationTimer);
      if (!isStale()) {
        state.agentPreparing = null;
        state.bridgeAbort = null;
      }
    }
  }

  function failBufferedInbound(reason: string): void {
    const entries = state.bridgeInboundBuffer.splice(0);
    for (const { channel, msg } of entries) {
      emitDeliveryStatus({ channel, messageId: msg.id, stage: "failed", error: reason });
    }
  }

  async function stopBridge(): Promise<void> {
    setDaemonAgentActivity(state, "idle");
    setDaemonAgentState(state, "idle");
    state.agentPreparing = null;
    state.bridgePrepGeneration += 1;
    failBufferedInbound("bridge stopped");
    await teardownBridgeRunner();
  }

  function clearAgentPreparation(): void {
    state.agentPreparing = null;
  }

  /** Outcome of attempting to deliver an inbound channel message to the bridge. */
  type InboundAcceptOutcome = "delivered" | "buffered" | "rejected";

  /** Channel-manager calls this once per inbound bridge-bound message. The
   *  bridge runner cannot guarantee being alive at the instant a message
   *  arrives (it might still be preparing), so we either forward, buffer
   *  bounded, or — if there is no session at all — reject so the browser sees
   *  a `delivery: failed` instead of a misleading `received`. */
  function tryAcceptInbound(entries: BufferedEntry[]): InboundAcceptOutcome {
    if (state.bridgeRunner) {
      state.bridgeRunner.enqueue(entries);
      return "delivered";
    }
    const sessionInFlight = state.activeSession !== null || state.agentPreparing !== null;
    if (!sessionInFlight) return "rejected";
    if (state.bridgeInboundBuffer.length + entries.length > MAX_BRIDGE_BUFFER_SIZE) {
      return "rejected";
    }
    state.bridgeInboundBuffer.push(...entries);
    return "buffered";
  }

  async function persistCanvasHtml(html: string): Promise<Record<string, unknown>> {
    const session = state.activeSession;
    if (!session) return { ok: false, error: "No active live session." };
    if (session.kind !== "pub") {
      return {
        ok: false,
        error: "Canvas writes are only supported in pub sessions, not tunnel mode.",
      };
    }
    try {
      const files = applyWorkspaceFiles(session.workspaceCanvasDir, {
        "index.html": html,
      });
      await publishWorkspaceFiles(session, files);
      commandHandler.bindFromHtml(html);
      return { ok: true, delivered: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      markError(`failed to persist canvas HTML for "${session.slug}"`, error);
      return { ok: false, error: `Canvas update failed: ${errMsg}` };
    }
  }

  async function persistFiles(files: Record<string, string>): Promise<Record<string, unknown>> {
    const session = state.activeSession;
    if (!session) return { ok: false, error: "No active live session." };
    if (session.kind !== "pub") {
      return {
        ok: false,
        error: "File writes via `pub write` are only supported in pub sessions, not tunnel mode.",
      };
    }
    try {
      const snapshot = applyWorkspaceFiles(session.workspaceCanvasDir, files);
      await publishWorkspaceFiles(session, snapshot);
      const indexHtml = snapshot["index.html"];
      if (indexHtml) commandHandler.bindFromHtml(indexHtml);
      return { ok: true, fileCount: Object.keys(snapshot).length };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      markError(`failed to write files for "${session.slug}"`, error);
      return { ok: false, error: `File write failed: ${errMsg}` };
    }
  }

  async function publishWorkspaceFiles(
    session: Extract<ActiveSession, { kind: "pub" }>,
    files = readWorkspaceFiles(session.workspaceCanvasDir),
  ): Promise<Record<string, string>> {
    await apiClient.update({ slug: session.slug, files });
    writeCanvasMirror(session.pubId, files);
    return files;
  }

  return {
    clearAgentPreparation,
    ensureAgentReady,
    markAgentStreaming,
    persistCanvasHtml,
    persistFiles,
    stopBridge,
    tryAcceptInbound,
  };
}
