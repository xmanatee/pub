import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { CONTROL_CHANNEL, makeStatusMessage } from "../../../../shared/bridge-protocol-core";
import { isLiveConnectionReady } from "../../../../shared/live-runtime-state-core";
import { exitProcess } from "../../core/process/exit.js";
import { createLiveCommandHandler } from "../command/handler.js";
import { latestCliVersionPath, liveSessionFilesDir } from "../runtime/daemon-files.js";
import { createBridgeManager } from "./bridge-manager.js";
import { createDaemonChannelManager } from "./channel-manager.js";
import { createDaemonIpcHandler } from "./ipc-handler.js";
import { createDaemonIpcServer } from "./ipc-server.js";
import { createDaemonLifecycle } from "./lifecycle.js";
import { createPeerManager } from "./peer-manager.js";
import { createPubFsHandler } from "./pub-fs-handler.js";
import type { DaemonConfig } from "./shared.js";
import {
  getLiveWriteReadinessError,
  isPresenceOwnershipConflictError,
  isRateLimitError,
} from "./shared.js";
import { createSignalingController } from "./signaling.js";
import { createDaemonState, setDaemonExecutorState } from "./state.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function startDaemon(config: DaemonConfig): Promise<void> {
  const { apiClient, socketPath, infoPath, logPath, cliVersion, agentName } = config;
  const state = createDaemonState();
  const startTime = Date.now();
  const daemonSessionId = randomUUID();
  const verboseEnabled = config.bridgeSettings.verbose === true;
  const versionFilePath = latestCliVersionPath();

  let channelManager!: ReturnType<typeof createDaemonChannelManager>;
  let bridgeManager!: ReturnType<typeof createBridgeManager>;
  let pubFsHandler!: ReturnType<typeof createPubFsHandler>;
  let peerManager!: ReturnType<typeof createPeerManager>;
  let presenceGeneration = 0;

  function formatOptionalValue(value: string | undefined): string {
    return value ?? "none";
  }

  let publishRuntimeState = async (_options?: {
    continued?: boolean;
    requireDelivery?: boolean;
  }): Promise<boolean> => false;

  const commandHandler = createLiveCommandHandler({
    bridgeSettings: config.bridgeSettings,
    debugLog: (message, error) => lifecycle.debugLog(message, error),
    markError: (message, error) => lifecycle.markError(message, error),
    getBridgeRunner: () => state.bridgeRunner,
    onExecutorStateChange: (executorState) => {
      const prev = state.runtimeState.executorState;
      setDaemonExecutorState(state, executorState);
      if (state.runtimeState.executorState === prev) return;
      void publishRuntimeState().catch((error) => {
        lifecycle.debugLog("failed to publish executor state", error);
      });
    },
    sendCommandMessage: async (msg) => {
      if (!isLiveConnectionReady(state.runtimeState)) return false;
      return await channelManager.sendOutboundMessageWithAck("command", msg, {
        context: 'command outbound on "command"',
        maxAttempts: 2,
      });
    },
  });

  async function shutdown(exitCode = 0): Promise<void> {
    if (state.stopped) return;
    state.stopped = true;
    presenceGeneration += 1;
    try {
      await cleanup();
    } catch (error) {
      lifecycle.logAlways("cleanup failed during shutdown", error);
    }
    await exitProcess(exitCode);
  }

  const lifecycle = createDaemonLifecycle({
    state,
    cliVersion,
    versionFilePath,
    debugEnabled: verboseEnabled,
    shutdown: async () => await shutdown(),
  });

  lifecycle.debugLog(
    [
      `daemon starting bridge=${config.bridgeSettings.mode}`,
      `socket=${socketPath}`,
      `info=${infoPath}`,
      `log=${formatOptionalValue(logPath)}`,
      `agent=${formatOptionalValue(agentName)}`,
    ].join(" "),
  );

  channelManager = createDaemonChannelManager({
    state,
    debugLog: lifecycle.debugLog,
    markError: lifecycle.markError,
    onCommandMessage: async (msg) => await commandHandler.onMessage(msg),
    onPubFsMessage: async (msg) => pubFsHandler.onMessage(msg),
    onChannelClosed: (name) => {
      if (name === CONTROL_CHANNEL || name === "command") {
        lifecycle.markError(`critical datachannel "${name}" closed unexpectedly`);
        lifecycle.handleConnectionClosed(`channel-closed-${name}`);
      }
    },
  });

  publishRuntimeState = async (options) => {
    if (state.stopped || !isLiveConnectionReady(state.runtimeState)) {
      return false;
    }

    const delivered = await channelManager.sendOutboundMessageWithAck(
      CONTROL_CHANNEL,
      makeStatusMessage({
        ...state.runtimeState,
        slug: state.signalingSlug ?? undefined,
        channels: [...state.channels.keys()],
        ...(options?.continued ? { continued: true } : {}),
      }),
      {
        context: 'runtime status on "_control"',
        maxAttempts: 2,
      },
    );

    if (!delivered && options?.requireDelivery) {
      throw new Error(`Failed to deliver runtime state for "${state.signalingSlug ?? "unknown"}"`);
    }

    return delivered;
  };

  pubFsHandler = createPubFsHandler({
    getSessionRootDir: () => (state.bridgeSlug ? liveSessionFilesDir(state.bridgeSlug) : null),
    markError: lifecycle.markError,
    openDataChannel: channelManager.openDataChannel,
    waitForChannelOpen: channelManager.waitForChannelOpen,
  });

  bridgeManager = createBridgeManager({
    state,
    bridgeSettings: config.bridgeSettings,
    commandHandler,
    apiClient,
    debugLog: lifecycle.debugLog,
    markError: lifecycle.markError,
    sendOutboundMessageWithAck: channelManager.sendOutboundMessageWithAck,
    publishRuntimeState,
    emitDeliveryStatus: channelManager.emitDeliveryStatus,
  });

  peerManager = createPeerManager({
    state,
    apiClient,
    daemonSessionId,
    agentName,
    debugLog: lifecycle.debugLog,
    markError: lifecycle.markError,
    setupChannel: channelManager.setupChannel,
    flushQueuedAcks: channelManager.flushQueuedAcks,
    failPendingAcks: channelManager.failPendingAcks,
    resetMessageDedup: channelManager.resetMessageDedup,
    clearAgentPreparation: bridgeManager.clearAgentPreparation,
    ensureAgentReady: async () => {
      lifecycle.startPingPong();
      await bridgeManager.ensureAgentReady();
    },
    handleConnectionClosed: lifecycle.handleConnectionClosed,
    clearLocalCandidateTimers: lifecycle.clearLocalCandidateTimers,
    stopPingPong: lifecycle.stopPingPong,
    commandHandlerStop: () => commandHandler.stop(),
    pubFsHandlerReset: () => pubFsHandler.reset(),
  });

  lifecycle.setConnectionClosedHandler((reason) => {
    void peerManager.clearActiveLiveSession(reason).catch((error) => {
      lifecycle.debugLog("failed to clear active live session", error);
    });
  });

  const signaling = createSignalingController({
    apiClient,
    daemonSessionId,
    debugLog: lifecycle.debugLog,
    markError: lifecycle.markError,
    isStopped: () => state.stopped,
    getActiveSlug: () => state.signalingSlug,
    getLastAppliedBrowserOffer: () => state.lastAppliedBrowserOffer,
    getLastBrowserCandidateCount: () => state.lastBrowserCandidateCount,
    setLastBrowserCandidateCount: (count) => {
      state.lastBrowserCandidateCount = count;
    },
    onRecover: peerManager.handleIncomingLive,
    onApplyBrowserCandidates: peerManager.applyBrowserCandidates,
    onClearLive: async () => {
      await peerManager.clearActiveLiveSession("signaling-cleared");
    },
    onReconnect: async () => {
      if (state.stopped) return;
      const generation = presenceGeneration;
      try {
        await apiClient.heartbeat({ daemonSessionId });
      } catch (error) {
        if (isRateLimitError(error)) {
          lifecycle.debugLog("heartbeat rate limited during reconnect, ignoring");
          return;
        }
        if (isPresenceOwnershipConflictError(error)) {
          await handlePresenceOwnershipConflict(error);
          return;
        }
        await reRegisterPresence(generation);
      }
    },
  });

  if (fs.existsSync(socketPath)) {
    let stale = true;
    try {
      const raw = fs.readFileSync(infoPath, "utf-8");
      const info = JSON.parse(raw) as { pid: number };
      process.kill(info.pid, 0);
      stale = false;
    } catch (error) {
      lifecycle.debugLog("stale socket check failed (assuming stale)", error);
    }

    if (stale) {
      try {
        fs.unlinkSync(socketPath);
      } catch (error) {
        lifecycle.debugLog("failed to remove stale daemon socket", error);
      }
    } else {
      throw new Error(`Daemon already running (socket: ${socketPath})`);
    }
  }

  async function handlePresenceOwnershipConflict(error: unknown): Promise<void> {
    lifecycle.markError("presence ownership lost", error, { alwaysLog: true });
    await shutdown(1);
  }

  async function reRegisterPresence(generation: number): Promise<void> {
    if (state.stopped || generation !== presenceGeneration) return;
    lifecycle.debugLog("re-registering presence");

    try {
      await apiClient.goOnline({ daemonSessionId, agentName });
    } catch (error) {
      if (isPresenceOwnershipConflictError(error)) {
        await handlePresenceOwnershipConflict(error);
        return;
      }
      lifecycle.markError("presence re-registration failed", error);
      return;
    }

    if (state.stopped || generation !== presenceGeneration) {
      lifecycle.debugLog("presence re-registered during shutdown, going offline again");
      try {
        await apiClient.goOffline({ daemonSessionId });
      } catch (error) {
        lifecycle.debugLog("failed to roll back presence after shutdown", error);
      }
      return;
    }

    lifecycle.debugLog("presence re-registered successfully");
  }

  await apiClient.goOnline({ daemonSessionId, agentName });
  state.heartbeatTimer = setInterval(async () => {
    if (state.stopped) return;
    const generation = presenceGeneration;
    try {
      await apiClient.heartbeat({ daemonSessionId });
    } catch (error) {
      if (isRateLimitError(error)) {
        lifecycle.debugLog("heartbeat rate limited during interval, ignoring");
        return;
      }
      if (isPresenceOwnershipConflictError(error)) {
        await handlePresenceOwnershipConflict(error);
        return;
      }
      await reRegisterPresence(generation);
    }
  }, HEARTBEAT_INTERVAL_MS);

  const handleIpcRequest = createDaemonIpcHandler({
    persistCanvasHtml: (html) => bridgeManager.persistCanvasHtml(html),
    getRuntimeState: () => state.runtimeState,
    getSignalingConnected: () => {
      const signalState = signaling.status();
      return signalState.known ? signalState.open : null;
    },
    getActiveSlug: () => state.signalingSlug,
    getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
    getChannels: () => [...state.channels.keys()],
    getLastError: () => state.lastError,
    getBridgeMode: () => config.bridgeSettings.mode,
    getBridgeStatus: () => state.bridgeRunner?.status() ?? null,
    getLogPath: () => logPath ?? null,
    getWriteReadinessError: () => getLiveWriteReadinessError(state.runtimeState.connectionState),
    openDataChannel: channelManager.openDataChannel,
    waitForChannelOpen: channelManager.waitForChannelOpen,
    waitForDeliveryAck: channelManager.waitForDeliveryAck,
    settlePendingAck: channelManager.settlePendingAck,
    markAgentStreaming: () => bridgeManager.markAgentStreaming(),
    markError: lifecycle.markError,
    shutdown: () => {
      void shutdown().catch((error) => {
        lifecycle.logAlways("shutdown failed from IPC request", error);
      });
    },
    writeAckTimeoutMs: 5_000,
    writeAckMaxAttempts: 2,
  });

  const ipcServer = createDaemonIpcServer(handleIpcRequest, (error) => {
    lifecycle.debugLog("IPC server error", error);
  });
  ipcServer.listen(socketPath);

  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });
  fs.writeFileSync(
    infoPath,
    JSON.stringify({ pid: process.pid, socketPath, logPath, startedAt: startTime, cliVersion }),
  );

  lifecycle.startHealthCheckTimer();
  signaling.start();

  async function cleanup(): Promise<void> {
    lifecycle.debugLog(
      `daemon cleanup start signalingSlug=${state.signalingSlug ?? "none"} connectionState=${state.runtimeState.connectionState} agentState=${state.runtimeState.agentState} executorState=${state.runtimeState.executorState}`,
    );

    lifecycle.clearAllTimers();

    try {
      await signaling.stop();
    } catch (error) {
      lifecycle.debugLog("signaling stop failed during cleanup", error);
    }

    try {
      await apiClient.goOffline({ daemonSessionId });
    } catch (error) {
      lifecycle.debugLog("failed to go offline", error);
    }

    try {
      await bridgeManager.stopBridge();
    } catch (error) {
      lifecycle.debugLog("bridge stop failed during cleanup", error);
    }

    commandHandler.stop();

    try {
      await peerManager.closeCurrentPeer();
    } catch (error) {
      lifecycle.debugLog("peer close failed during cleanup", error);
    }

    ipcServer.close();

    try {
      fs.unlinkSync(socketPath);
    } catch (error) {
      lifecycle.debugLog("failed to remove daemon socket during cleanup", error);
    }
    try {
      fs.unlinkSync(infoPath);
    } catch (error) {
      lifecycle.debugLog("failed to remove daemon info file during cleanup", error);
    }

    lifecycle.debugLog("daemon cleanup complete");
  }

  process.on("SIGTERM", () => {
    lifecycle.logAlways("received SIGTERM");
    void shutdown(0).catch((error) => {
      lifecycle.logAlways("shutdown failed after SIGTERM", error);
    });
  });
  process.on("SIGINT", () => {
    lifecycle.logAlways("received SIGINT");
    void shutdown(0).catch((error) => {
      lifecycle.logAlways("shutdown failed after SIGINT", error);
    });
  });
  process.on("SIGHUP", () => {
    lifecycle.logAlways("received SIGHUP");
    void shutdown(0).catch((error) => {
      lifecycle.logAlways("shutdown failed after SIGHUP", error);
    });
  });
  process.on("uncaughtException", (error) => {
    lifecycle.markError("uncaught exception in daemon", error, { alwaysLog: true });
    void shutdown(1).catch((shutdownError) => {
      lifecycle.logAlways("shutdown failed after uncaught exception", shutdownError);
    });
  });
  process.on("unhandledRejection", (reason) => {
    lifecycle.markError("unhandled rejection in daemon", reason, { alwaysLog: true });
  });
}
