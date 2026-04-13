import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { CONTROL_CHANNEL, makeStatusMessage } from "../../../../shared/bridge-protocol-core";
import { isLiveConnectionReady } from "../../../../shared/live-runtime-state-core";
import { exitProcess } from "../../core/process/exit.js";
import { createLiveCommandHandler } from "../command/handler.js";
import { latestCliVersionPath } from "../runtime/daemon-files.js";
import { type DevServer, killProcessGroup } from "../server/manager.js";
import type { TunnelDataChannel } from "../tunnel/channel-adapter.js";
import type { TunnelConnection } from "../tunnel/client.js";
import type { WsProxy } from "../tunnel/ws-proxy.js";
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
    getRuntimeBridgeSettings: () =>
      state.activeLiveSession
        ? {
            ...config.bridgeSettings,
            workspaceDir: state.activeLiveSession.workspaceCanvasDir,
            attachmentDir: state.activeLiveSession.attachmentDir,
            artifactsDir: state.activeLiveSession.artifactsDir,
          }
        : config.bridgeSettings,
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
    getSessionRootDir: () => state.activeLiveSession?.workspaceCanvasDir ?? null,
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
    commandHandlerBeginManifestLoad: () => commandHandler.beginManifestLoad(),
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
    persistFiles: (files) => bridgeManager.persistFiles(files),
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
  const socketDir = path.dirname(socketPath);
  if (!fs.existsSync(socketDir)) fs.mkdirSync(socketDir, { recursive: true });
  ipcServer.listen(socketPath);

  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });
  function writeInfoFile(devServerPid?: number): void {
    const tmp = `${infoPath}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        pid: process.pid,
        socketPath,
        logPath,
        startedAt: startTime,
        cliVersion,
        devServerPid,
      }),
    );
    fs.renameSync(tmp, infoPath);
  }
  writeInfoFile();

  signaling.start();
  lifecycle.startHealthCheckTimer();

  let devServer: DevServer | null = null;
  let tunnelConnection: TunnelConnection | null = null;
  let wsProxy: WsProxy | null = null;
  const tunnelChannels = new Map<string, TunnelDataChannel>();

  const devCommand = config.tunnelConfig?.devCommand;
  const devPort = config.tunnelConfig?.devPort;

  if (devCommand && devPort) {
    const { startDevServer } = await import("../server/manager.js");
    const { connectTunnel } = await import("../tunnel/client.js");
    const { createHttpProxy } = await import("../tunnel/proxy.js");
    const { createWsProxy } = await import("../tunnel/ws-proxy.js");
    const { TunnelDataChannel: TDC } = await import("../tunnel/channel-adapter.js");

    const { token } = await apiClient.registerTunnel({ daemonSessionId });
    const { DEFAULT_RELAY_URL } = await import("../../core/config/types.js");
    const relayUrl = config.tunnelConfig?.relayUrl ?? DEFAULT_RELAY_URL;
    const tunnelBase = `/t/${token}/`;
    lifecycle.debugLog(`tunnel registered: ${relayUrl}${tunnelBase}`);

    const devCwd = config.tunnelConfig?.devCwd;
    lifecycle.debugLog(
      `starting dev server: ${devCommand} (port ${devPort}${devCwd ? ` cwd=${devCwd}` : ""})`,
    );
    devServer = startDevServer({ devCommand, devCwd, devPort, tunnelBase });
    writeInfoFile(devServer.pid);

    try {
      await devServer.ready;
    } catch (error) {
      lifecycle.markError("dev server failed to start", error, { alwaysLog: true });
      await devServer.stop();
      devServer = null;
      await shutdown(1);
      return;
    }
    lifecycle.debugLog(`dev server ready on port ${devPort} (pid ${devServer.pid})`);

    {
      const httpProxy = createHttpProxy(devPort, tunnelBase);
      wsProxy = createWsProxy(devPort, (msg) => tunnelConnection?.send(msg), tunnelBase);

      function getOrCreateTunnelChannel(name: string): TunnelDataChannel {
        let tc = tunnelChannels.get(name);
        if (!tc) {
          tc = new TDC(name, (msg) => tunnelConnection?.send(msg));
          tunnelChannels.set(name, tc);
          channelManager.setupChannel(name, tc);
          tc.markOpen();
        }
        return tc;
      }

      tunnelConnection = connectTunnel({
        relayUrl,
        apiKey: process.env.PUB_DAEMON_API_KEY ?? "",
        daemonSessionId,
        onMessage: async (msg) => {
          switch (msg.type) {
            case "http-request":
              await httpProxy.handle(msg, (m) => tunnelConnection?.send(m));
              break;
            case "ws-open":
              wsProxy?.handleOpen(msg);
              break;
            case "ws-data":
              wsProxy?.handleData(msg);
              break;
            case "ws-close":
              wsProxy?.handleClose(msg);
              break;
            case "channel": {
              const tc = getOrCreateTunnelChannel(msg.channel);
              tc.dispatchMessage(msg.message);
              break;
            }
            case "channel-binary": {
              const tc = getOrCreateTunnelChannel(msg.channel);
              tc.dispatchBinary(Buffer.from(msg.data, "base64"));
              break;
            }
          }
        },
        onConnected: () => lifecycle.debugLog("tunnel connected"),
        onDisconnected: () => lifecycle.debugLog("tunnel disconnected, reconnecting..."),
        debugLog: verboseEnabled ? (msg) => lifecycle.debugLog(`[tunnel] ${msg}`) : undefined,
      });
    }
  }

  async function cleanup(): Promise<void> {
    lifecycle.debugLog(
      `daemon cleanup start signalingSlug=${state.signalingSlug ?? "none"} connectionState=${state.runtimeState.connectionState} agentState=${state.runtimeState.agentState} executorState=${state.runtimeState.executorState}`,
    );

    lifecycle.clearAllTimers();

    wsProxy?.closeAll();
    for (const tc of tunnelChannels.values()) tc.close();
    tunnelChannels.clear();

    if (tunnelConnection) {
      await tunnelConnection.close();
      await apiClient.closeTunnel({ daemonSessionId }).catch((error) => {
        lifecycle.debugLog("tunnel close failed during cleanup", error);
      });
    }

    if (devServer) {
      await devServer.stop();
    }

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

  function triggerShutdown(cause: string, exitCode: number): void {
    void shutdown(exitCode).catch((error) => {
      lifecycle.logAlways(`shutdown failed after ${cause}`, error);
    });
  }
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(signal, () => {
      lifecycle.logAlways(`received ${signal}`);
      triggerShutdown(signal, 0);
    });
  }
  process.on("uncaughtException", (error) => {
    lifecycle.markError("uncaught exception in daemon", error, { alwaysLog: true });
    triggerShutdown("uncaught exception", 1);
  });
  process.on("unhandledRejection", (reason) => {
    lifecycle.markError("unhandled rejection in daemon", reason, { alwaysLog: true });
    triggerShutdown("unhandled rejection", 1);
  });
  // Synchronous last-ditch reaper for paths where async cleanup didn't run
  // (uncaughtException re-thrown, native process.exit, etc.). SIGKILL on the
  // daemon bypasses this; stopRecordedDaemons covers that case at preflight.
  process.on("exit", () => {
    if (devServer) killProcessGroup(devServer.pid, "SIGKILL");
  });
}
