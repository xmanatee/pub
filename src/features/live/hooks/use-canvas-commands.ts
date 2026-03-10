import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHANNELS } from "~/features/live/lib/bridge-protocol";
import {
  COMMAND_PROTOCOL_VERSION,
  type CommandCancelPayload,
  type CommandInvokePayload,
  makeCommandCancelMessage,
  makeCommandInvokeMessage,
  parseCommandResultMessage,
} from "~/features/live/lib/command-protocol";
import type {
  BridgeState,
  BrowserBridge,
  ChannelMessage,
} from "~/features/live/lib/webrtc-browser";
import { ensureChannelReady } from "~/features/live/lib/webrtc-channel";
import { PARENT_TO_CANVAS_SOURCE } from "~/features/live/types/live-command-types";
import type {
  CanvasBridgeCommandMessage,
  CanvasBridgeOutboundMessage,
  LiveCommandSummary,
} from "~/features/live/types/live-types";

const COMMAND_ACK_TIMEOUT_MS = 4_000;

interface UseCanvasCommandsOptions {
  bridgeRef: RefObject<BrowserBridge | null>;
  bridgeState: BridgeState;
  liveMode: boolean;
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

export function useCanvasCommands({ bridgeRef, bridgeState, liveMode }: UseCanvasCommandsOptions) {
  const [outboundCanvasBridgeMessage, setOutboundCanvasBridgeMessage] =
    useState<CanvasBridgeOutboundMessage | null>(null);
  const [outboundQueue, setOutboundQueue] = useState<CanvasBridgeOutboundMessage[]>([]);
  const [commandState, setCommandState] = useState<CommandLifecycleState>({
    activeById: {},
    lastCompleted: null,
  });
  const activeCommandsRef = useRef<CommandLifecycleState["activeById"]>({});
  const pendingCommandQueueRef = useRef<CanvasBridgeCommandMessage[]>([]);

  const command = useMemo(() => summarizeCommands(commandState), [commandState]);

  useEffect(() => {
    activeCommandsRef.current = commandState.activeById;
  }, [commandState.activeById]);

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
    setCommandState((current) => ({
      activeById: {
        ...current.activeById,
        [callId]: {
          callId,
          name,
          phase: "running",
          updatedAt: Date.now(),
        },
      },
      lastCompleted: current.lastCompleted,
    }));
  }, []);

  const trackCommandCancel = useCallback((callId: string) => {
    setCommandState((current) => {
      const existing = current.activeById[callId];
      if (!existing) return current;
      return {
        activeById: {
          ...current.activeById,
          [callId]: {
            ...existing,
            phase: "canceling",
            updatedAt: Date.now(),
          },
        },
        lastCompleted: current.lastCompleted,
      };
    });
  }, []);

  const trackCommandRunning = useCallback((callId: string) => {
    setCommandState((current) => {
      const existing = current.activeById[callId];
      if (!existing || existing.phase === "running") return current;
      return {
        activeById: {
          ...current.activeById,
          [callId]: {
            ...existing,
            phase: "running",
            updatedAt: Date.now(),
          },
        },
        lastCompleted: current.lastCompleted,
      };
    });
  }, []);

  const trackCommandResult = useCallback(
    (params: { callId: string; errorMessage: string | null; name: string | null; ok: boolean }) => {
      setCommandState((current) => {
        const nextActiveById = { ...current.activeById };
        const existing = nextActiveById[params.callId];
        delete nextActiveById[params.callId];
        return {
          activeById: nextActiveById,
          lastCompleted: {
            callId: params.callId,
            errorMessage: params.ok ? null : params.errorMessage,
            finishedAt: Date.now(),
            name: params.name ?? existing?.name ?? null,
            phase: params.ok ? "succeeded" : "failed",
          },
        };
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

      setCommandState((current) => {
        if (Object.keys(current.activeById).length === 0) return current;
        return {
          activeById: {},
          lastCompleted: interrupted.lastCompleted,
        };
      });
    },
    [enqueueOutboundCanvasMessage],
  );

  useEffect(() => {
    if (!liveMode) {
      interruptActiveCommands({
        code: "COMMAND_INTERRUPTED",
        message: "Command interrupted because live mode was disabled.",
      });
      return;
    }

    if (bridgeState !== "disconnected" && bridgeState !== "closed") return;

    interruptActiveCommands({
      code: "COMMAND_INTERRUPTED",
      message: "Command interrupted because the live connection was lost.",
    });
  }, [bridgeState, interruptActiveCommands, liveMode]);

  const dispatchCommand = useCallback(
    (message: CanvasBridgeCommandMessage) => {
      const bridge = bridgeRef.current;
      if (!bridge) {
        emitCommandFailureToCanvas({
          callId: message.payload.callId,
          code: "BRIDGE_UNAVAILABLE",
          message: "Command failed because live bridge is unavailable.",
        });
        return;
      }

      if (message.type === "command.cancel") {
        const payload: CommandCancelPayload = message.payload;
        trackCommandCancel(payload.callId);
        void ensureChannelReady(bridge, CHANNELS.COMMAND)
          .then(async (ready) => {
            if (!ready) {
              trackCommandRunning(payload.callId);
              return;
            }

            const delivered = await bridge.sendWithAck(
              CHANNELS.COMMAND,
              makeCommandCancelMessage(payload),
              COMMAND_ACK_TIMEOUT_MS,
            );
            if (!delivered) trackCommandRunning(payload.callId);
          })
          .catch(() => {
            trackCommandRunning(payload.callId);
          });
        return;
      }

      const invokePayload: CommandInvokePayload = message.payload;
      trackCommandStart(invokePayload.callId, invokePayload.name);

      void ensureChannelReady(bridge, CHANNELS.COMMAND)
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
          const delivered = await bridge.sendWithAck(
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
      bridgeRef,
      emitCommandFailureToCanvas,
      trackCommandCancel,
      trackCommandRunning,
      trackCommandStart,
    ],
  );

  const onCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeCommandMessage) => {
      const callId = message.payload.callId;

      if (!liveMode) {
        emitCommandFailureToCanvas({
          callId,
          code: "AGENT_NOT_CONNECTED",
          message: "Agent is not connected. Commands are unavailable.",
        });
        return;
      }

      if (bridgeState === "disconnected" || bridgeState === "closed") {
        emitCommandFailureToCanvas({
          callId,
          code: "AGENT_NOT_CONNECTED",
          message: "Agent is not connected. Commands are unavailable.",
        });
        return;
      }

      if (bridgeState === "connecting") {
        pendingCommandQueueRef.current.push(message);
        return;
      }

      dispatchCommand(message);
    },
    [bridgeState, dispatchCommand, emitCommandFailureToCanvas, liveMode],
  );

  useEffect(() => {
    if (bridgeState !== "connected") return;
    const queued = pendingCommandQueueRef.current.splice(0);
    for (const message of queued) {
      dispatchCommand(message);
    }
  }, [bridgeState, dispatchCommand]);

  useEffect(() => {
    if (liveMode && bridgeState !== "disconnected" && bridgeState !== "closed") return;
    const queued = pendingCommandQueueRef.current.splice(0);
    for (const message of queued) {
      emitCommandFailureToCanvas({
        callId: message.payload.callId,
        code: "AGENT_NOT_CONNECTED",
        message: "Agent is not connected. Commands are unavailable.",
      });
    }
  }, [bridgeState, emitCommandFailureToCanvas, liveMode]);

  const handleBridgeCommandMessage = useCallback(
    (cm: ChannelMessage) => {
      if (cm.channel !== CHANNELS.COMMAND) return;
      const result = parseCommandResultMessage(cm.message);
      if (!result) return;
      trackCommandResult({
        callId: result.callId,
        errorMessage: result.error?.message ?? null,
        name: null,
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
  };
}
