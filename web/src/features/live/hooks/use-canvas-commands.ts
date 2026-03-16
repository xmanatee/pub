import {
  type CanvasFileOperation,
  type CanvasFileResultPayload,
  MAX_CANVAS_FILE_BYTES,
  makeCanvasFileDownloadRequestMessage,
  parseCanvasFileResultMessage,
} from "@shared/canvas-file-protocol-core";
import {
  canSendCanvasFileTraffic,
  canSendCommandTraffic,
  type LiveRuntimeStateSnapshot,
} from "@shared/live-runtime-state-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BridgeMessage,
  CHANNELS,
  makeStreamEnd,
  makeStreamStart,
} from "~/features/live/lib/bridge-protocol";
import {
  COMMAND_PROTOCOL_VERSION,
  type CommandCancelPayload,
  type CommandInvokePayload,
  makeCommandCancelMessage,
  makeCommandInvokeMessage,
  parseCommandResultMessage,
} from "~/features/live/lib/command-protocol";
import type { ChannelMessage } from "~/features/live/lib/webrtc-browser";
import { PARENT_TO_CANVAS_SOURCE } from "~/features/live/types/live-command-types";
import type {
  CanvasBridgeCommandMessage,
  CanvasBridgeOutboundMessage,
  LiveCommandSummary,
} from "~/features/live/types/live-types";

const COMMAND_ACK_TIMEOUT_MS = 4_000;
const CANVAS_FILE_ACK_TIMEOUT_MS = 10_000;
const CANVAS_FILE_STREAM_CHUNK_SIZE = 48 * 1024;
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1_000;

interface UseCanvasCommandsOptions {
  sendOnChannel: (channel: string, message: BridgeMessage) => boolean;
  sendBinaryOnChannel: (channel: string, data: ArrayBuffer) => boolean;
  sendWithAckOnChannel: (
    channel: string,
    message: BridgeMessage,
    timeoutMs?: number,
  ) => Promise<boolean>;
  ensureChannel: (channel: string, timeoutMs?: number) => Promise<boolean>;
  canvasScopeKey: string;
  runtimeState: LiveRuntimeStateSnapshot;
  liveMode: boolean;
  sessionKey: string;
}

interface ActiveCommand {
  callId: string;
  name: string;
  phase: "running" | "canceling";
  updatedAt: number;
}

interface CommandLifecycleState {
  activeById: Record<string, ActiveCommand>;
  lastCompleted: {
    callId: string;
    errorMessage: string | null;
    finishedAt: number;
    name: string | null;
    phase: "failed" | "succeeded";
  } | null;
}

interface ActiveCanvasDownload {
  chunks: ArrayBuffer[];
  completed: boolean;
  filename: string;
  mime: string;
}

type CanvasCommandOnlyMessage = Extract<
  CanvasBridgeCommandMessage,
  { type: "command.invoke" | "command.cancel" }
>;

const EMPTY_COMMAND_STATE: CommandLifecycleState = {
  activeById: {},
  lastCompleted: null,
};

function getLatestActiveCommand(
  activeById: CommandLifecycleState["activeById"],
): ActiveCommand | null {
  let latest: ActiveCommand | null = null;
  for (const command of Object.values(activeById)) {
    if (!latest || command.updatedAt > latest.updatedAt) latest = command;
  }
  return latest;
}

interface InterruptedCommandState {
  lastCompleted: NonNullable<CommandLifecycleState["lastCompleted"]>;
  outboundMessages: CanvasBridgeOutboundMessage[];
}

export function buildInterruptedCommandState(
  activeById: CommandLifecycleState["activeById"],
  params: { code: string; message: string },
): InterruptedCommandState | null {
  const activeCommands = Object.values(activeById);
  if (activeCommands.length === 0) return null;
  const interrupted = getLatestActiveCommand(activeById);
  if (!interrupted) return null;

  return {
    lastCompleted: {
      callId: interrupted.callId,
      errorMessage: params.message,
      finishedAt: Date.now(),
      name: interrupted.name,
      phase: "failed",
    },
    outboundMessages: activeCommands.map((activeCommand) => ({
      source: PARENT_TO_CANVAS_SOURCE,
      type: "command.result",
      payload: {
        v: COMMAND_PROTOCOL_VERSION,
        callId: activeCommand.callId,
        ok: false,
        error: {
          code: params.code,
          message: params.message,
          retryable: false,
        },
        durationMs: 0,
      },
    })),
  };
}

function summarizeCommands(state: CommandLifecycleState): LiveCommandSummary {
  const activeCount = Object.keys(state.activeById).length;
  const current = getLatestActiveCommand(state.activeById);
  if (current) {
    return {
      activeCallId: current.callId,
      activeCommandName: current.name,
      activeCount,
      errorMessage: null,
      finishedAt: null,
      phase: current.phase,
    };
  }

  if (state.lastCompleted) {
    return {
      activeCallId: null,
      activeCommandName: state.lastCompleted.name,
      activeCount: 0,
      errorMessage: state.lastCompleted.errorMessage,
      finishedAt: state.lastCompleted.finishedAt,
      phase: state.lastCompleted.phase,
    };
  }

  return {
    activeCallId: null,
    activeCommandName: null,
    activeCount: 0,
    errorMessage: null,
    finishedAt: null,
    phase: "idle",
  };
}

function clickDownloadLink(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function useCanvasCommands({
  sendOnChannel,
  sendBinaryOnChannel,
  sendWithAckOnChannel,
  ensureChannel,
  canvasScopeKey,
  runtimeState,
  liveMode,
  sessionKey,
}: UseCanvasCommandsOptions) {
  const [outboundCanvasBridgeMessage, setOutboundCanvasBridgeMessage] =
    useState<CanvasBridgeOutboundMessage | null>(null);
  const [outboundQueue, setOutboundQueue] = useState<CanvasBridgeOutboundMessage[]>([]);
  const [commandState, setCommandState] = useState<CommandLifecycleState>(EMPTY_COMMAND_STATE);
  const activeCommandsRef = useRef<CommandLifecycleState["activeById"]>({});
  const pendingBridgeQueueRef = useRef<CanvasBridgeCommandMessage[]>([]);
  const pendingCanvasFileRequestsRef = useRef<Map<string, CanvasFileOperation>>(new Map());
  const activeCanvasDownloadsRef = useRef<Map<string, ActiveCanvasDownload>>(new Map());
  const lastCanvasScopeKeyRef = useRef<string | null>(null);
  const lastSessionKeyRef = useRef<string | null>(null);

  const command = useMemo(() => summarizeCommands(commandState), [commandState]);

  const reset = useCallback(() => {
    console.debug(
      "[canvas-cmd] RESET — clearing active commands:",
      Object.keys(activeCommandsRef.current),
      "pending:",
      pendingBridgeQueueRef.current.length,
    );
    activeCommandsRef.current = {};
    pendingBridgeQueueRef.current = [];
    pendingCanvasFileRequestsRef.current.clear();
    activeCanvasDownloadsRef.current.clear();
    setCommandState(EMPTY_COMMAND_STATE);
    setOutboundQueue([]);
    setOutboundCanvasBridgeMessage(null);
  }, []);
  const enqueueOutboundCanvasMessage = useCallback((message: CanvasBridgeOutboundMessage) => {
    setOutboundQueue((current) => [...current, message]);
  }, []);

  useEffect(() => {
    if (outboundCanvasBridgeMessage !== null) return;
    const [nextMessage, ...rest] = outboundQueue;
    if (!nextMessage) return;
    setOutboundCanvasBridgeMessage(nextMessage);
    setOutboundQueue(rest);
  }, [outboundCanvasBridgeMessage, outboundQueue]);

  useEffect(() => {
    if (!outboundCanvasBridgeMessage) return;
    const timer = window.setTimeout(() => {
      setOutboundCanvasBridgeMessage(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [outboundCanvasBridgeMessage]);

  const trackCommandStart = useCallback((callId: string, name: string) => {
    activeCommandsRef.current = {
      ...activeCommandsRef.current,
      [callId]: {
        callId,
        name,
        phase: "running",
        updatedAt: Date.now(),
      },
    };
    setCommandState((current) => ({
      activeById: activeCommandsRef.current,
      lastCompleted: current.lastCompleted,
    }));
  }, []);

  const trackCommandCancel = useCallback((callId: string) => {
    const existingRef = activeCommandsRef.current[callId];
    if (!existingRef) return;
    activeCommandsRef.current = {
      ...activeCommandsRef.current,
      [callId]: {
        ...existingRef,
        phase: "canceling",
        updatedAt: Date.now(),
      },
    };
    setCommandState((current) => ({
      activeById: activeCommandsRef.current,
      lastCompleted: current.lastCompleted,
    }));
  }, []);

  const trackCommandRunning = useCallback((callId: string) => {
    const existingRef = activeCommandsRef.current[callId];
    if (!existingRef || existingRef.phase === "running") return;
    activeCommandsRef.current = {
      ...activeCommandsRef.current,
      [callId]: {
        ...existingRef,
        phase: "running",
        updatedAt: Date.now(),
      },
    };
    setCommandState((current) => ({
      activeById: activeCommandsRef.current,
      lastCompleted: current.lastCompleted,
    }));
  }, []);

  const trackCommandResult = useCallback(
    (params: { callId: string; errorMessage: string | null; name: string | null; ok: boolean }) => {
      const nextActiveById = { ...activeCommandsRef.current };
      const existing = nextActiveById[params.callId];
      delete nextActiveById[params.callId];
      activeCommandsRef.current = nextActiveById;

      setCommandState({
        activeById: activeCommandsRef.current,
        lastCompleted: {
          callId: params.callId,
          errorMessage: params.ok ? null : params.errorMessage,
          finishedAt: Date.now(),
          name: params.name ?? existing?.name ?? null,
          phase: params.ok ? "succeeded" : "failed",
        },
      });
    },
    [],
  );

  const emitCommandFailureToCanvas = useCallback(
    (params: {
      callId: string | undefined;
      code: string;
      message: string;
      name?: string | null;
    }) => {
      if (!params.callId) return;
      trackCommandResult({
        callId: params.callId,
        errorMessage: params.message,
        name: params.name ?? null,
        ok: false,
      });
      enqueueOutboundCanvasMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "command.result",
        payload: {
          v: COMMAND_PROTOCOL_VERSION,
          callId: params.callId,
          ok: false,
          error: { code: params.code, message: params.message, retryable: false },
          durationMs: 0,
        },
      });
    },
    [enqueueOutboundCanvasMessage, trackCommandResult],
  );

  const emitFileResultToCanvas = useCallback(
    (payload: CanvasFileResultPayload) => {
      enqueueOutboundCanvasMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "file.result",
        payload,
      });
    },
    [enqueueOutboundCanvasMessage],
  );

  const emitFileFailureToCanvas = useCallback(
    (params: {
      requestId: string | undefined;
      op: CanvasFileOperation;
      code: string;
      message: string;
    }) => {
      if (!params.requestId) return;
      pendingCanvasFileRequestsRef.current.delete(params.requestId);
      activeCanvasDownloadsRef.current.delete(params.requestId);
      emitFileResultToCanvas({
        requestId: params.requestId,
        op: params.op,
        ok: false,
        error: {
          code: params.code,
          message: params.message,
        },
      });
    },
    [emitFileResultToCanvas],
  );

  const interruptActiveCommands = useCallback(
    (params: { code: string; message: string }) => {
      const interrupted = buildInterruptedCommandState(activeCommandsRef.current, params);
      if (!interrupted) return;
      for (const message of interrupted.outboundMessages) {
        enqueueOutboundCanvasMessage(message);
      }
      activeCommandsRef.current = {};
      setCommandState({
        activeById: {},
        lastCompleted: interrupted.lastCompleted,
      });
    },
    [enqueueOutboundCanvasMessage],
  );

  const interruptPendingCanvasFiles = useCallback(
    (params: { code: string; message: string }) => {
      for (const [requestId, op] of pendingCanvasFileRequestsRef.current) {
        emitFileResultToCanvas({
          requestId,
          op,
          ok: false,
          error: {
            code: params.code,
            message: params.message,
          },
        });
      }
      pendingCanvasFileRequestsRef.current.clear();
      activeCanvasDownloadsRef.current.clear();
    },
    [emitFileResultToCanvas],
  );

  const dispatchCanvasFileUpload = useCallback(
    (message: Extract<CanvasBridgeCommandMessage, { type: "file.upload" }>) => {
      const { bytes, mime, requestId } = message.payload;
      if (bytes.byteLength === 0) {
        emitFileFailureToCanvas({
          requestId,
          op: "upload",
          code: "UPLOAD_EMPTY",
          message: "File upload requires non-empty bytes.",
        });
        return;
      }
      if (bytes.byteLength > MAX_CANVAS_FILE_BYTES) {
        emitFileFailureToCanvas({
          requestId,
          op: "upload",
          code: "UPLOAD_TOO_LARGE",
          message: `File upload exceeds the ${MAX_CANVAS_FILE_BYTES} byte limit.`,
        });
        return;
      }

      pendingCanvasFileRequestsRef.current.set(requestId, "upload");

      void ensureChannel(CHANNELS.CANVAS_FILE)
        .then(async (ready) => {
          if (!ready) {
            emitFileFailureToCanvas({
              requestId,
              op: "upload",
              code: "FILE_CHANNEL_NOT_READY",
              message: "Canvas file channel is not ready.",
            });
            return;
          }

          const startMessage = makeStreamStart(
            {
              mime,
              size: bytes.byteLength,
            },
            requestId,
          );

          if (!sendOnChannel(CHANNELS.CANVAS_FILE, startMessage)) {
            emitFileFailureToCanvas({
              requestId,
              op: "upload",
              code: "UPLOAD_START_FAILED",
              message: "Failed to start uploading bytes to the daemon.",
            });
            return;
          }

          const chunkBytes = new Uint8Array(bytes);
          for (
            let offset = 0;
            offset < chunkBytes.length;
            offset += CANVAS_FILE_STREAM_CHUNK_SIZE
          ) {
            const nextChunk = chunkBytes.slice(offset, offset + CANVAS_FILE_STREAM_CHUNK_SIZE);
            if (!sendBinaryOnChannel(CHANNELS.CANVAS_FILE, nextChunk.buffer)) {
              emitFileFailureToCanvas({
                requestId,
                op: "upload",
                code: "UPLOAD_CHUNK_FAILED",
                message: "File upload was interrupted while streaming bytes.",
              });
              return;
            }
          }

          const ended = await sendWithAckOnChannel(
            CHANNELS.CANVAS_FILE,
            makeStreamEnd(requestId),
            CANVAS_FILE_ACK_TIMEOUT_MS,
          );
          if (!ended) {
            emitFileFailureToCanvas({
              requestId,
              op: "upload",
              code: "UPLOAD_TIMEOUT",
              message: "File upload did not complete in time.",
            });
          }
        })
        .catch((error) => {
          const detail =
            error instanceof Error && error.message.trim().length > 0
              ? ` ${error.message.trim()}`
              : "";
          emitFileFailureToCanvas({
            requestId,
            op: "upload",
            code: "UPLOAD_ROUTE_FAILED",
            message: `File upload failed to reach the daemon.${detail}`,
          });
        });
    },
    [
      emitFileFailureToCanvas,
      ensureChannel,
      sendBinaryOnChannel,
      sendOnChannel,
      sendWithAckOnChannel,
    ],
  );

  const dispatchCanvasFileDownload = useCallback(
    (message: Extract<CanvasBridgeCommandMessage, { type: "file.download" }>) => {
      const requestId = message.payload.requestId;

      pendingCanvasFileRequestsRef.current.set(requestId, "download");

      void ensureChannel(CHANNELS.CANVAS_FILE)
        .then(async (ready) => {
          if (!ready) {
            emitFileFailureToCanvas({
              requestId,
              op: "download",
              code: "FILE_CHANNEL_NOT_READY",
              message: "Canvas file channel is not ready.",
            });
            return;
          }

          const delivered = await sendWithAckOnChannel(
            CHANNELS.CANVAS_FILE,
            makeCanvasFileDownloadRequestMessage(message.payload),
            CANVAS_FILE_ACK_TIMEOUT_MS,
          );
          if (!delivered) {
            emitFileFailureToCanvas({
              requestId,
              op: "download",
              code: "DOWNLOAD_REQUEST_FAILED",
              message: "File download request could not be delivered.",
            });
          }
        })
        .catch((error) => {
          const detail =
            error instanceof Error && error.message.trim().length > 0
              ? ` ${error.message.trim()}`
              : "";
          emitFileFailureToCanvas({
            requestId,
            op: "download",
            code: "DOWNLOAD_ROUTE_FAILED",
            message: `File download failed to reach the daemon.${detail}`,
          });
        });
    },
    [emitFileFailureToCanvas, ensureChannel, sendWithAckOnChannel],
  );

  useEffect(() => {
    if (lastCanvasScopeKeyRef.current === null) {
      lastCanvasScopeKeyRef.current = canvasScopeKey;
      return;
    }
    if (lastCanvasScopeKeyRef.current === canvasScopeKey) return;
    lastCanvasScopeKeyRef.current = canvasScopeKey;
    reset();
  }, [canvasScopeKey, reset]);

  useEffect(() => {
    if (lastSessionKeyRef.current === null) {
      lastSessionKeyRef.current = sessionKey;
      return;
    }
    if (lastSessionKeyRef.current === sessionKey) return;
    lastSessionKeyRef.current = sessionKey;
    interruptActiveCommands({
      code: "COMMAND_INTERRUPTED",
      message: "Command interrupted because the live session changed.",
    });
    interruptPendingCanvasFiles({
      code: "FILE_TRANSFER_INTERRUPTED",
      message: "File transfer interrupted because the live session changed.",
    });
  }, [interruptActiveCommands, interruptPendingCanvasFiles, sessionKey]);

  useEffect(() => {
    if (!liveMode) {
      interruptActiveCommands({
        code: "COMMAND_INTERRUPTED",
        message: "Command interrupted because live mode was disabled.",
      });
      interruptPendingCanvasFiles({
        code: "FILE_TRANSFER_INTERRUPTED",
        message: "File transfer interrupted because live mode was disabled.",
      });
      return;
    }

    if (runtimeState.connectionState !== "failed") return;

    interruptActiveCommands({
      code: "COMMAND_INTERRUPTED",
      message: "Command interrupted because the live connection was lost.",
    });
    interruptPendingCanvasFiles({
      code: "FILE_TRANSFER_INTERRUPTED",
      message: "File transfer interrupted because the live connection was lost.",
    });
  }, [
    interruptActiveCommands,
    interruptPendingCanvasFiles,
    liveMode,
    runtimeState.connectionState,
  ]);

  const dispatchCommand = useCallback(
    (message: CanvasCommandOnlyMessage) => {
      if (message.type === "command.cancel") {
        const payload: CommandCancelPayload = message.payload;
        trackCommandCancel(payload.callId);
        void ensureChannel(CHANNELS.COMMAND)
          .then(async (ready) => {
            if (!ready) {
              trackCommandRunning(payload.callId);
              return;
            }

            const delivered = await sendWithAckOnChannel(
              CHANNELS.COMMAND,
              makeCommandCancelMessage(payload),
              COMMAND_ACK_TIMEOUT_MS,
            );
            if (!delivered) trackCommandRunning(payload.callId);
          })
          .catch((error) => {
            console.warn("Command cancellation failed to reach daemon", error);
            trackCommandRunning(payload.callId);
          });
        return;
      }

      const invokePayload: CommandInvokePayload = message.payload;
      console.debug("[canvas-cmd] trackCommandStart", invokePayload.name, invokePayload.callId);
      trackCommandStart(invokePayload.callId, invokePayload.name);

      void ensureChannel(CHANNELS.COMMAND)
        .then(async (ready) => {
          if (!ready) {
            emitCommandFailureToCanvas({
              callId: invokePayload.callId,
              code: "COMMAND_CHANNEL_NOT_READY",
              message: "Command channel is not ready.",
              name: invokePayload.name,
            });
            return;
          }
          const delivered = await sendWithAckOnChannel(
            CHANNELS.COMMAND,
            makeCommandInvokeMessage(invokePayload),
            COMMAND_ACK_TIMEOUT_MS,
          );
          if (!delivered) {
            emitCommandFailureToCanvas({
              callId: invokePayload.callId,
              code: "COMMAND_DELIVERY_FAILED",
              message: "Command invocation could not be delivered.",
              name: invokePayload.name,
            });
          }
        })
        .catch((error) => {
          const detail =
            error instanceof Error && error.message.trim().length > 0
              ? ` ${error.message.trim()}`
              : "";
          emitCommandFailureToCanvas({
            callId: invokePayload.callId,
            code: "COMMAND_ROUTE_FAILED",
            message: `Command invocation failed to route to daemon.${detail}`,
            name: invokePayload.name,
          });
        });
    },
    [
      emitCommandFailureToCanvas,
      ensureChannel,
      sendWithAckOnChannel,
      trackCommandCancel,
      trackCommandRunning,
      trackCommandStart,
    ],
  );

  const emitUnavailableFailure = useCallback(
    (message: CanvasBridgeCommandMessage) => {
      if (!liveMode) {
        if (message.type === "file.upload") {
          emitFileFailureToCanvas({
            requestId: message.payload.requestId,
            op: "upload",
            code: "LIVE_MODE_DISABLED",
            message: "Live mode is disabled. File uploads are unavailable.",
          });
          return;
        }

        if (message.type === "file.download") {
          emitFileFailureToCanvas({
            requestId: message.payload.requestId,
            op: "download",
            code: "LIVE_MODE_DISABLED",
            message: "Live mode is disabled. File downloads are unavailable.",
          });
          return;
        }

        emitCommandFailureToCanvas({
          callId: message.payload.callId,
          code: "LIVE_MODE_DISABLED",
          message: "Live mode is disabled. Commands are unavailable.",
        });
        return;
      }

      if (message.type === "file.upload") {
        emitFileFailureToCanvas({
          requestId: message.payload.requestId,
          op: "upload",
          code: "CONNECTION_UNAVAILABLE",
          message: "File uploads require a live connection.",
        });
        return;
      }

      if (message.type === "file.download") {
        emitFileFailureToCanvas({
          requestId: message.payload.requestId,
          op: "download",
          code: "CONNECTION_UNAVAILABLE",
          message: "File downloads require a live connection.",
        });
        return;
      }

      emitCommandFailureToCanvas({
        callId: message.payload.callId,
        code:
          runtimeState.connectionState === "connected"
            ? "EXECUTOR_UNAVAILABLE"
            : "CONNECTION_UNAVAILABLE",
        message:
          runtimeState.connectionState === "connected"
            ? "Commands are unavailable until the executor is ready."
            : "Commands require a live connection.",
      });
    },
    [emitCommandFailureToCanvas, emitFileFailureToCanvas, liveMode, runtimeState.connectionState],
  );

  const dispatchCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeCommandMessage) => {
      if (message.type === "file.upload") {
        dispatchCanvasFileUpload(message);
        return;
      }
      if (message.type === "file.download") {
        dispatchCanvasFileDownload(message);
        return;
      }
      dispatchCommand(message);
    },
    [dispatchCanvasFileDownload, dispatchCanvasFileUpload, dispatchCommand],
  );

  const canDispatchCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeCommandMessage) => {
      if (message.type === "file.upload" || message.type === "file.download") {
        return canSendCanvasFileTraffic(runtimeState);
      }
      return canSendCommandTraffic(runtimeState);
    },
    [runtimeState],
  );

  const onCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeCommandMessage) => {
      if (!liveMode) {
        emitUnavailableFailure(message);
        return;
      }

      if (runtimeState.connectionState === "failed") {
        emitUnavailableFailure(message);
        return;
      }

      if (!canDispatchCanvasBridgeMessage(message)) {
        console.debug(
          "[canvas-cmd] command queued (runtime not ready)",
          (message as { payload?: { name?: string } }).payload?.name,
        );
        pendingBridgeQueueRef.current.push(message);
        return;
      }

      console.debug(
        "[canvas-cmd] command dispatching immediately",
        (message as { payload?: { name?: string } }).payload?.name,
      );
      dispatchCanvasBridgeMessage(message);
    },
    [
      canDispatchCanvasBridgeMessage,
      dispatchCanvasBridgeMessage,
      emitUnavailableFailure,
      liveMode,
      runtimeState.connectionState,
    ],
  );

  useEffect(() => {
    if (pendingBridgeQueueRef.current.length === 0) return;
    const queued = pendingBridgeQueueRef.current.splice(0);
    const stillPending: CanvasBridgeCommandMessage[] = [];
    for (const message of queued) {
      if (!canDispatchCanvasBridgeMessage(message)) {
        stillPending.push(message);
        continue;
      }
      dispatchCanvasBridgeMessage(message);
    }
    pendingBridgeQueueRef.current = stillPending;
  }, [canDispatchCanvasBridgeMessage, dispatchCanvasBridgeMessage]);

  useEffect(() => {
    if (liveMode && runtimeState.connectionState !== "failed") return;
    const queued = pendingBridgeQueueRef.current.splice(0);
    for (const message of queued) {
      emitUnavailableFailure(message);
    }
  }, [emitUnavailableFailure, liveMode, runtimeState.connectionState]);

  const handleBridgeCommandMessage = useCallback(
    (cm: ChannelMessage) => {
      if (cm.channel !== CHANNELS.COMMAND) return;
      const result = parseCommandResultMessage(cm.message);
      if (!result) {
        console.debug(
          "[canvas-cmd] command channel message not a result",
          cm.message.type,
          cm.message.data,
        );
        return;
      }
      const activeCommand = activeCommandsRef.current[result.callId];
      if (!activeCommand) {
        console.debug(
          "[canvas-cmd] DROPPED result — no active command for callId",
          result.callId,
          "active:",
          Object.keys(activeCommandsRef.current),
        );
        return;
      }
      console.debug(
        "[canvas-cmd] result received for",
        activeCommand.name,
        "callId:",
        result.callId,
        "ok:",
        result.ok,
      );
      trackCommandResult({
        callId: result.callId,
        errorMessage: result.error?.message ?? null,
        name: activeCommand.name,
        ok: result.ok,
      });
      enqueueOutboundCanvasMessage({
        source: PARENT_TO_CANVAS_SOURCE,
        type: "command.result",
        payload: result,
      });
    },
    [enqueueOutboundCanvasMessage, trackCommandResult],
  );

  const handleBridgeCanvasFileMessage = useCallback(
    (cm: ChannelMessage) => {
      if (cm.channel !== CHANNELS.CANVAS_FILE) return;

      if (cm.message.type === "stream-start") {
        activeCanvasDownloadsRef.current.set(cm.message.id, {
          chunks: [],
          completed: false,
          filename:
            typeof cm.message.meta?.filename === "string" && cm.message.meta.filename.length > 0
              ? cm.message.meta.filename
              : "download.bin",
          mime:
            typeof cm.message.meta?.mime === "string" && cm.message.meta.mime.length > 0
              ? cm.message.meta.mime
              : "application/octet-stream",
        });
        return;
      }

      if (cm.message.type === "binary" && cm.binaryData) {
        const requestId =
          typeof cm.message.meta?.streamId === "string" && cm.message.meta.streamId.length > 0
            ? cm.message.meta.streamId
            : "";
        if (!requestId) return;
        const active = activeCanvasDownloadsRef.current.get(requestId);
        if (!active) return;
        active.chunks.push(cm.binaryData);
        return;
      }

      if (cm.message.type === "stream-end") {
        const requestId =
          typeof cm.message.meta?.streamId === "string" && cm.message.meta.streamId.length > 0
            ? cm.message.meta.streamId
            : "";
        if (!requestId) return;
        const active = activeCanvasDownloadsRef.current.get(requestId);
        if (!active) return;
        active.completed = true;
        return;
      }

      const result = parseCanvasFileResultMessage(cm.message);
      if (!result) return;
      if (!pendingCanvasFileRequestsRef.current.has(result.requestId)) {
        activeCanvasDownloadsRef.current.delete(result.requestId);
        return;
      }

      pendingCanvasFileRequestsRef.current.delete(result.requestId);

      if (!result.ok) {
        activeCanvasDownloadsRef.current.delete(result.requestId);
        emitFileResultToCanvas(result);
        return;
      }

      if (result.op === "download") {
        const active = activeCanvasDownloadsRef.current.get(result.requestId);
        if (!active || !active.completed) {
          emitFileFailureToCanvas({
            requestId: result.requestId,
            op: "download",
            code: "DOWNLOAD_INCOMPLETE",
            message: "Download stream did not complete cleanly.",
          });
          return;
        }

        activeCanvasDownloadsRef.current.delete(result.requestId);
        const blob = new Blob(active.chunks, { type: active.mime });
        const downloadUrl = URL.createObjectURL(blob);
        clickDownloadLink(downloadUrl, active.filename);
        const revokeObjectUrl =
          typeof URL.revokeObjectURL === "function" ? URL.revokeObjectURL.bind(URL) : null;
        if (revokeObjectUrl) {
          window.setTimeout(() => revokeObjectUrl(downloadUrl), DOWNLOAD_URL_REVOKE_DELAY_MS);
        }
      }

      emitFileResultToCanvas(result);
    },
    [emitFileFailureToCanvas, emitFileResultToCanvas],
  );

  return {
    command,
    handleBridgeCommandMessage,
    handleBridgeCanvasFileMessage,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
    reset,
  };
}
