import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { createLiveCommandHandler } from "../command/handler.js";
import { latestCliVersionPath } from "../runtime/daemon-files.js";
import { createDaemonIpcHandler } from "./ipc-handler.js";
import { createDaemonIpcServer } from "./ipc-server.js";
import { createPeerManager } from "./peer-manager.js";
import { createDaemonChannelManager } from "./channel-manager.js";
import { createBridgeManager } from "./bridge-manager.js";
import { createDaemonLifecycle } from "./lifecycle.js";
import { createSignalingController } from "./signaling.js";
import type { ChannelBuffer, DaemonConfig } from "./shared.js";
import { getLiveWriteReadinessError } from "./shared.js";
import { createDaemonState } from "./state.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function startDaemon(config: DaemonConfig): Promise<void> {
  const { apiClient, socketPath, infoPath, cliVersion, agentName } = config;
  const buffer: ChannelBuffer = { messages: [] };
  const state = createDaemonState(buffer);
  const startTime = Date.now();
  const daemonSessionId = randomUUID();
  const debugEnabled = process.env.PUB_LIVE_DEBUG === "1";
  const versionFilePath = latestCliVersionPath();

  let channelManager!: ReturnType<typeof createDaemonChannelManager>;
  let bridgeManager!: ReturnType<typeof createBridgeManager>;
  let peerManager!: ReturnType<typeof createPeerManager>;
  let shuttingDown = false;

  const commandHandler = createLiveCommandHandler({
    bridgeSettings: config.bridgeSettings,
    debugLog: (message, error) => lifecycle.debugLog(message, error),
    markError: (message, error) => lifecycle.markError(message, error),
    sendCommandMessage: async (msg) => {
      if (!state.browserConnected) return false;
      return await channelManager.sendOutboundMessageWithAck("command", msg, {
        context: 'command outbound on "command"',
        maxAttempts: 2,
      });
    },
  });

  async function shutdown(exitCode = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await cleanup();
    process.exit(exitCode);
  }

  const lifecycle = createDaemonLifecycle({
    state,
    cliVersion,
    versionFilePath,
    debugEnabled,
    closeCurrentPeer: async () => await peerManager.closeCurrentPeer(),
    stopBridge: async () => await bridgeManager.stopBridge(),
    resetNegotiationState: () => peerManager.resetNegotiationState(),
    commandHandlerStop: () => commandHandler.stop(),
    shutdown: async () => await shutdown(),
  });

  channelManager = createDaemonChannelManager({
    state,
    debugLog: lifecycle.debugLog,
    markError: lifecycle.markError,
    onCommandMessage: async (msg) => await commandHandler.onMessage(msg),
  });

  bridgeManager = createBridgeManager({
    state,
    bridgeSettings: config.bridgeSettings,
    commandHandler,
    apiClient,
    debugLog: lifecycle.debugLog,
    markError: lifecycle.markError,
    sendOutboundMessageWithAck: channelManager.sendOutboundMessageWithAck,
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
    ensureBridgePrimed: async () => {
      lifecycle.startPingPong();
      await bridgeManager.ensureBridgePrimed();
    },
    handleConnectionClosed: lifecycle.handleConnectionClosed,
    clearLocalCandidateTimers: lifecycle.clearLocalCandidateTimers,
    stopPingPong: lifecycle.stopPingPong,
    stopBridge: async () => await bridgeManager.stopBridge(),
    commandHandlerStop: () => commandHandler.stop(),
  });

  const signaling = createSignalingController({
    apiClient,
    daemonSessionId,
    debugLog: lifecycle.debugLog,
    markError: lifecycle.markError,
    isStopped: () => state.stopped,
    getActiveSlug: () => state.activeSlug,
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

  await apiClient.goOnline({ daemonSessionId, agentName });
  state.heartbeatTimer = setInterval(async () => {
    if (state.stopped) return;
    try {
      await apiClient.heartbeat({ daemonSessionId });
    } catch (error) {
      lifecycle.markError("heartbeat failed", error);
    }
  }, HEARTBEAT_INTERVAL_MS);

  const handleIpcRequest = createDaemonIpcHandler({
    apiClient,
    bindCanvasCommands: (html) => commandHandler.bindFromHtml(html),
    getConnected: () => lifecycle.isLiveConnected(),
    getSignalingConnected: () => {
      const signalState = signaling.status();
      return signalState.known ? signalState.open : null;
    },
    getActiveSlug: () => state.activeSlug,
    getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
    getChannels: () => [...state.channels.keys()],
    getBufferedMessages: () => state.buffer.messages,
    setBufferedMessages: (messages) => {
      state.buffer.messages = messages;
    },
    getLastError: () => state.lastError,
    getBridgeMode: () => config.bridgeSettings.mode,
    getBridgeStatus: () => state.bridgeRunner?.status() ?? null,
    getWriteReadinessError: () => getLiveWriteReadinessError(lifecycle.isLiveConnected()),
    openDataChannel: channelManager.openDataChannel,
    waitForChannelOpen: channelManager.waitForChannelOpen,
    waitForDeliveryAck: channelManager.waitForDeliveryAck,
    settlePendingAck: channelManager.settlePendingAck,
    markError: lifecycle.markError,
    shutdown: () => {
      void shutdown();
    },
    writeAckTimeoutMs: 5_000,
    writeAckMaxAttempts: 2,
  });

  const ipcServer = createDaemonIpcServer(handleIpcRequest);
  ipcServer.listen(socketPath);

  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });
  fs.writeFileSync(
    infoPath,
    JSON.stringify({ pid: process.pid, socketPath, startedAt: startTime, cliVersion }),
  );

  lifecycle.startHealthCheckTimer();
  signaling.start();

  async function cleanup(): Promise<void> {
    if (state.stopped) return;
    state.stopped = true;

    lifecycle.clearLocalCandidateTimers();
    lifecycle.clearHealthCheckTimer();
    lifecycle.clearHeartbeatTimer();
    lifecycle.stopPingPong();
    await signaling.stop();

    try {
      await apiClient.goOffline({ daemonSessionId });
    } catch (error) {
      lifecycle.debugLog("failed to go offline", error);
    }

    await bridgeManager.stopBridge();
    commandHandler.stop();
    await peerManager.closeCurrentPeer();
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
  }

  process.on("SIGTERM", () => {
    void shutdown(0);
  });
  process.on("SIGINT", () => {
    void shutdown(0);
  });
  process.on("uncaughtException", (error) => {
    lifecycle.markError("uncaught exception in daemon", error);
    void shutdown(1);
  });
  process.on("unhandledRejection", (reason) => {
    lifecycle.markError("unhandled rejection in daemon", reason);
    void shutdown(1);
  });
}
