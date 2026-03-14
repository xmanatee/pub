import { CONTROL_CHANNEL, encodeMessage, makeEventMessage } from "../../../../shared/bridge-protocol-core";
import { errorMessage } from "../../core/errors/cli-error.js";
import { readLatestCliVersion } from "../runtime/daemon-files.js";
import { PING_INTERVAL_MS, PONG_TIMEOUT_MS } from "./shared.js";
import type { DaemonState } from "./state.js";

const HEALTH_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function createDaemonLifecycle(params: {
  state: DaemonState;
  cliVersion?: string;
  versionFilePath: string;
  debugEnabled: boolean;
  closeCurrentPeer: () => Promise<void>;
  resetNegotiationState: () => void;
  commandHandlerStop: () => void;
  canvasFileTransferReset: () => void;
  shutdown: () => Promise<void>;
}) {
  const {
    state,
    cliVersion,
    versionFilePath,
    debugEnabled,
    closeCurrentPeer,
    resetNegotiationState,
    commandHandlerStop,
    canvasFileTransferReset,
    shutdown,
  } = params;

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

  function isLiveConnected(): boolean {
    return state.browserConnected && state.bridgePrimed;
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

  function handleConnectionClosed(reason: string): void {
    const hadSession = state.browserConnected || state.bridgePrimed || state.activeSlug !== null;
    if (!hadSession) return;
    logAlways(`connection closed: ${reason}`);
    state.activeSlug = null;
    commandHandlerStop();
    canvasFileTransferReset();
    resetNegotiationState();
    void closeCurrentPeer().catch((error) => {
      markError("failed to clean up after connection closed", error);
    });
  }

  function startPingPong(): void {
    stopPingPong();
    state.pingTimer = setInterval(() => {
      if (!state.browserConnected || state.stopped) {
        stopPingPong();
        return;
      }
      const controlDc = state.channels.get(CONTROL_CHANNEL);
      if (!controlDc) return;
      try {
        controlDc.sendMessage(encodeMessage(makeEventMessage("ping")));
        if (state.pongTimeout) clearTimeout(state.pongTimeout);
        state.pongTimeout = setTimeout(() => {
          if (!state.browserConnected || state.stopped) return;
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
        void shutdown();
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
    clearHeartbeatTimer,
    clearHealthCheckTimer,
    clearLocalCandidateTimers,
    debugLog,
    handleConnectionClosed,
    isLiveConnected,
    logAlways,
    markError,
    startHealthCheckTimer,
    startPingPong,
    stopPingPong,
  };
}
