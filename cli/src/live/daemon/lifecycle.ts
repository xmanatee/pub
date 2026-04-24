import {
  CONTROL_CHANNEL,
  encodeMessage,
  makeEventMessage,
} from "../../../../shared/bridge-protocol-core";
import { isLiveConnectionReady } from "../../../../shared/live-runtime-state-core";
import { errorMessage } from "../../core/errors/cli-error.js";
import type { DataChannelLike } from "../transport/webrtc-adapter.js";
import { readLatestCliVersion } from "../runtime/daemon-files.js";
import { PING_INTERVAL_MS, PONG_TIMEOUT_MS } from "./shared.js";
import type { DaemonState } from "./state.js";

const HEALTH_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function createDaemonLifecycle(params: {
  state: DaemonState;
  cliVersion?: string;
  versionFilePath: string;
  debugEnabled: boolean;
  shutdown: () => Promise<void>;
}) {
  const { state, cliVersion, versionFilePath, debugEnabled, shutdown } = params;

  let onConnectionClosed: (reason: string) => void = () => {};

  function writeLog(message: string, error?: unknown, alwaysLog = false): void {
    if (!debugEnabled && !alwaysLog) return;
    const detail =
      error === undefined
        ? ""
        : ` | ${
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : typeof error === "string"
                ? error
                : JSON.stringify(error)
          }`;
    console.error(`[pub-agent] ${message}${detail}`);
  }

  function debugLog(message: string, error?: unknown): void {
    writeLog(message, error);
  }

  function logAlways(message: string, error?: unknown): void {
    writeLog(message, error, true);
  }

  function markError(message: string, error?: unknown, options?: { alwaysLog?: boolean }): void {
    state.lastError = error === undefined ? message : `${message}: ${errorMessage(error)}`;
    writeLog(message, error, options?.alwaysLog === true);
  }

  function clearLocalCandidateTimers(): void {
    if (state.localCandidateInterval) {
      clearInterval(state.localCandidateInterval);
      state.localCandidateInterval = null;
    }
    if (state.localCandidateStopTimer) {
      clearTimeout(state.localCandidateStopTimer);
      state.localCandidateStopTimer = null;
    }
  }

  function clearHealthCheckTimer(): void {
    if (state.healthCheckTimer) {
      clearInterval(state.healthCheckTimer);
      state.healthCheckTimer = null;
    }
  }

  function clearHeartbeatTimer(): void {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
  }

  function stopPingPong(): void {
    if (state.pingTimer) {
      clearInterval(state.pingTimer);
      state.pingTimer = null;
    }
    if (state.pongTimeout) {
      clearTimeout(state.pongTimeout);
      state.pongTimeout = null;
    }
  }

  function clearAllTimers(): void {
    clearLocalCandidateTimers();
    clearHealthCheckTimer();
    clearHeartbeatTimer();
    stopPingPong();
  }

  function handleConnectionClosed(reason: string): void {
    const hadSession =
      state.runtimeState.connectionState !== "idle" || state.signalingSlug !== null;
    if (!hadSession) return;
    logAlways(`connection closed: ${reason}`);
    onConnectionClosed(reason);
  }

  function setConnectionClosedHandler(handler: (reason: string) => void): void {
    onConnectionClosed = handler;
  }

  function findPeerControlChannel(): DataChannelLike | null {
    const bucket = state.channels.get(CONTROL_CHANNEL);
    if (!bucket) return null;
    for (const dc of bucket) {
      if (state.peerDataChannels.has(dc) && dc.isOpen()) return dc;
    }
    return null;
  }

  function startPingPong(): void {
    stopPingPong();
    state.pingTimer = setInterval(() => {
      if (!isLiveConnectionReady(state.runtimeState) || state.stopped) {
        stopPingPong();
        return;
      }
      const peerControlDc = findPeerControlChannel();
      if (!peerControlDc) return;
      try {
        peerControlDc.sendMessage(encodeMessage(makeEventMessage("ping")));
        if (state.pongTimeout) clearTimeout(state.pongTimeout);
        state.pongTimeout = setTimeout(() => {
          if (!isLiveConnectionReady(state.runtimeState) || state.stopped) return;
          debugLog("pong timeout — treating as disconnected");
          handleConnectionClosed("pong-timeout");
        }, PONG_TIMEOUT_MS);
      } catch (error) {
        debugLog("ping send failed", error);
      }
    }, PING_INTERVAL_MS);
  }

  function runHealthCheck(): void {
    if (state.stopped || !cliVersion) return;
    try {
      const latest = readLatestCliVersion(versionFilePath);
      if (latest && latest !== cliVersion) {
        markError(`detected CLI upgrade (${cliVersion} → ${latest}); shutting down`);
        void shutdown().catch((error) => {
          logAlways("shutdown failed after CLI upgrade detection", error);
        });
      }
    } catch (error) {
      markError("health check failed to read latest CLI version", error);
    }
  }

  function startHealthCheckTimer(): void {
    clearHealthCheckTimer();
    state.healthCheckTimer = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
    runHealthCheck();
  }

  return {
    clearAllTimers,
    clearLocalCandidateTimers,
    debugLog,
    handleConnectionClosed,
    logAlways,
    markError,
    setConnectionClosedHandler,
    startHealthCheckTimer,
    startPingPong,
    stopPingPong,
  };
}
