import {
  canSendCommandTraffic,
  type LiveRuntimeStateSnapshot,
} from "@shared/live-runtime-state-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BridgeMessage, CHANNELS } from "~/features/live/lib/bridge-protocol";
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

interface UseCanvasCommandsOptions {
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
  commandsPaused?: boolean;
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

export function useCanvasCommands({
  sendWithAckOnChannel,
  ensureChannel,
  canvasScopeKey,
  runtimeState,
  liveMode,
  sessionKey,
  commandsPaused = false,
}: UseCanvasCommandsOptions) {
  const [outboundCanvasBridgeMessage, setOutboundCanvasBridgeMessage] =
    useState<CanvasBridgeOutboundMessage | null>(null);
  const [outboundQueue, setOutboundQueue] = useState<CanvasBridgeOutboundMessage[]>([]);
  const [commandState, setCommandState] = useState<CommandLifecycleState>(EMPTY_COMMAND_STATE);
  const activeCommandsRef = useRef<CommandLifecycleState["activeById"]>({});
  const pendingBridgeQueueRef = useRef<CanvasBridgeCommandMessage[]>([]);
  const lastCanvasScopeKeyRef = useRef<string | null>(null);
  const lastSessionKeyRef = useRef<string | null>(null);

  const command = useMemo(() => summarizeCommands(commandState), [commandState]);

  const reset = useCallback(() => {
    activeCommandsRef.current = {};
    pendingBridgeQueueRef.current = [];
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
      [callId]: { callId, name, phase: "running", updatedAt: Date.now() },
    };
    setCommandState((current) => ({
      activeById: activeCommandsRef.current,
      lastCompleted: current.lastCompleted,
    }));
  }, []);

  const trackCommandCancel = useCallback((callId: string) => {
    const existing = activeCommandsRef.current[callId];
    if (!existing) return;
    activeCommandsRef.current = {
      ...activeCommandsRef.current,
      [callId]: { ...existing, phase: "canceling", updatedAt: Date.now() },
    };
    setCommandState((current) => ({
      activeById: activeCommandsRef.current,
      lastCompleted: current.lastCompleted,
    }));
  }, []);

  const trackCommandRunning = useCallback((callId: string) => {
    const existing = activeCommandsRef.current[callId];
    if (!existing || existing.phase === "running") return;
    activeCommandsRef.current = {
      ...activeCommandsRef.current,
      [callId]: { ...existing, phase: "running", updatedAt: Date.now() },
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
  }, [interruptActiveCommands, sessionKey]);

  useEffect(() => {
    if (!liveMode) {
      interruptActiveCommands({
        code: "COMMAND_INTERRUPTED",
        message: "Command interrupted because live mode was disabled.",
      });
      return;
    }
    if (runtimeState.connectionState !== "failed") return;
    interruptActiveCommands({
      code: "COMMAND_INTERRUPTED",
      message: "Command interrupted because the live connection was lost.",
    });
  }, [interruptActiveCommands, liveMode, runtimeState.connectionState]);

  const dispatchCommand = useCallback(
    (message: CanvasBridgeCommandMessage) => {
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

  const onCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeCommandMessage) => {
      if (!liveMode) {
        emitCommandFailureToCanvas({
          callId: message.payload.callId,
          code: "LIVE_MODE_DISABLED",
          message: "Live mode is disabled. Commands are unavailable.",
        });
        return;
      }

      if (runtimeState.connectionState === "failed") {
        emitCommandFailureToCanvas({
          callId: message.payload.callId,
          code: "CONNECTION_UNAVAILABLE",
          message: "Commands require a live connection.",
        });
        return;
      }

      if (commandsPaused || !canSendCommandTraffic(runtimeState)) {
        pendingBridgeQueueRef.current.push(message);
        return;
      }

      dispatchCommand(message);
    },
    [commandsPaused, dispatchCommand, emitCommandFailureToCanvas, liveMode, runtimeState],
  );

  useEffect(() => {
    if (commandsPaused || pendingBridgeQueueRef.current.length === 0) return;
    const queued = pendingBridgeQueueRef.current.splice(0);
    const stillPending: CanvasBridgeCommandMessage[] = [];
    for (const message of queued) {
      if (!canSendCommandTraffic(runtimeState)) {
        stillPending.push(message);
        continue;
      }
      dispatchCommand(message);
    }
    pendingBridgeQueueRef.current = stillPending;
  }, [commandsPaused, dispatchCommand, runtimeState]);

  useEffect(() => {
    if (liveMode && runtimeState.connectionState !== "failed") return;
    const queued = pendingBridgeQueueRef.current.splice(0);
    for (const message of queued) {
      emitCommandFailureToCanvas({
        callId: message.payload.callId,
        code: liveMode ? "CONNECTION_UNAVAILABLE" : "LIVE_MODE_DISABLED",
        message: liveMode
          ? "Commands require a live connection."
          : "Live mode is disabled. Commands are unavailable.",
      });
    }
  }, [emitCommandFailureToCanvas, liveMode, runtimeState.connectionState]);

  const handleBridgeCommandMessage = useCallback(
    (cm: ChannelMessage) => {
      if (cm.channel !== CHANNELS.COMMAND) return;
      const result = parseCommandResultMessage(cm.message);
      if (!result) return;
      const activeCommand = activeCommandsRef.current[result.callId];
      if (!activeCommand) return;
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

  return {
    command,
    handleBridgeCommandMessage,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
    outboundQueue,
    reset,
  };
}
