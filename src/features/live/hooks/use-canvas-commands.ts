import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { CHANNELS, generateMessageId, makeEventMessage } from "~/features/live/lib/bridge-protocol";
import { parseCommandResultMessage } from "~/features/live/lib/command-protocol";
import type {
  BridgeState,
  BrowserBridge,
  ChannelMessage,
} from "~/features/live/lib/webrtc-browser";
import { ensureChannelReady } from "~/features/live/lib/webrtc-channel";
import type {
  CanvasBridgeInboundMessage,
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
  const [commandState, setCommandState] = useState<CommandLifecycleState>({
    activeById: {},
    lastCompleted: null,
  });

  const command = useMemo(() => summarizeCommands(commandState), [commandState]);

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
      setOutboundCanvasBridgeMessage({
        id: generateMessageId(),
        type: "command.result",
        payload: {
          v: 1,
          callId: params.callId,
          ok: false,
          error: { code: params.code, message: params.message, retryable: false },
          durationMs: 0,
        },
      });
    },
    [trackCommandResult],
  );

  useEffect(() => {
    if (!liveMode) {
      setCommandState((current) => {
        if (Object.keys(current.activeById).length === 0) return current;
        return {
          activeById: {},
          lastCompleted: current.lastCompleted,
        };
      });
      return;
    }

    if (bridgeState !== "disconnected" && bridgeState !== "closed") return;

    setCommandState((current) => {
      const interrupted = getLatestActiveCommand(current.activeById);
      if (!interrupted) return current;
      return {
        activeById: {},
        lastCompleted: {
          callId: interrupted.callId,
          errorMessage: "Command interrupted because the live connection was lost.",
          finishedAt: Date.now(),
          name: interrupted.name,
          phase: "failed",
        },
      };
    });
  }, [bridgeState, liveMode]);

  const onCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeInboundMessage) => {
      const callId =
        typeof message.payload.callId === "string" ? message.payload.callId : undefined;

      if (!liveMode || bridgeState !== "connected") {
        emitCommandFailureToCanvas({
          callId,
          code: "AGENT_NOT_CONNECTED",
          message: "Agent is not connected. Commands are unavailable.",
        });
        return;
      }

      const bridge = bridgeRef.current;
      if (!bridge) {
        emitCommandFailureToCanvas({
          callId,
          code: "BRIDGE_UNAVAILABLE",
          message: "Command failed because live bridge is unavailable.",
        });
        return;
      }

      if (message.type === "command.cancel") {
        const payload = {
          v: typeof message.payload.v === "number" ? message.payload.v : 1,
          callId: callId ?? "",
          reason: typeof message.payload.reason === "string" ? message.payload.reason : undefined,
        };
        if (payload.callId.length === 0) return;
        trackCommandCancel(payload.callId);
        void ensureChannelReady(bridge, CHANNELS.COMMAND)
          .then(async (ready) => {
            if (!ready) {
              trackCommandRunning(payload.callId);
              return;
            }

            const delivered = await bridge.sendWithAck(
              CHANNELS.COMMAND,
              makeEventMessage("command.cancel", payload),
              COMMAND_ACK_TIMEOUT_MS,
            );
            if (!delivered) trackCommandRunning(payload.callId);
          })
          .catch(() => {
            trackCommandRunning(payload.callId);
          });
        return;
      }

      const invokePayload = {
        v: typeof message.payload.v === "number" ? message.payload.v : 1,
        callId: callId ?? "",
        name: typeof message.payload.name === "string" ? message.payload.name : "",
        args:
          message.payload.args && typeof message.payload.args === "object"
            ? (message.payload.args as Record<string, unknown>)
            : {},
        timeoutMs:
          typeof message.payload.timeoutMs === "number" && message.payload.timeoutMs > 0
            ? message.payload.timeoutMs
            : undefined,
      };
      if (invokePayload.callId.length === 0 || invokePayload.name.length === 0) {
        emitCommandFailureToCanvas({
          callId,
          code: "INVALID_COMMAND_INVOKE",
          message: "Invalid command payload.",
        });
        return;
      }

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
            makeEventMessage("command.invoke", invokePayload),
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
      bridgeState,
      emitCommandFailureToCanvas,
      liveMode,
      trackCommandCancel,
      trackCommandRunning,
      trackCommandStart,
    ],
  );

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
      setOutboundCanvasBridgeMessage({
        id: generateMessageId(),
        type: "command.result",
        payload: result,
      });
    },
    [trackCommandResult],
  );

  return {
    command,
    handleBridgeCommandMessage,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
  };
}
