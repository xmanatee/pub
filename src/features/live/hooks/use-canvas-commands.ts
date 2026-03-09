import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import {
  CHANNELS,
  generateMessageId,
  makeEventMessage,
} from "~/features/live/lib/bridge-protocol";
import { parseCommandResultMessage } from "~/features/live/lib/command-protocol";
import type { BridgeState, BrowserBridge, ChannelMessage } from "~/features/live/lib/webrtc-browser";
import { ensureChannelReady } from "~/features/live/lib/webrtc-channel";
import type {
  CanvasBridgeInboundMessage,
  CanvasBridgeOutboundMessage,
} from "~/features/live/types/live-types";
import { parseCanvasManifest } from "~/features/live/utils/parse-canvas-manifest";

const COMMAND_ACK_TIMEOUT_MS = 4_000;

interface UseCanvasCommandsOptions {
  html: string | null;
  bridgeRef: RefObject<BrowserBridge | null>;
  bridgeState: BridgeState;
  liveMode: boolean;
}

export function useCanvasCommands({
  html,
  bridgeRef,
  bridgeState,
  liveMode,
}: UseCanvasCommandsOptions) {
  const [outboundCanvasBridgeMessage, setOutboundCanvasBridgeMessage] =
    useState<CanvasBridgeOutboundMessage | null>(null);

  const manifest = useMemo(() => (html ? parseCanvasManifest(html) : null), [html]);

  // Notify iframe of available commands whenever manifest or connection state changes.
  // Daemon binds from the same HTML independently via Convex — no WebRTC round-trip needed.
  useEffect(() => {
    if (!manifest) return;

    const accepted = manifest.functions
      .filter((f) => f.executor)
      .map((f) => ({ name: f.name, returns: f.returns ?? "void" }));

    const rejected = manifest.functions
      .filter((f) => !f.executor)
      .map((f) => ({
        name: f.name,
        code: "INVALID_FUNCTION",
        message: `Function "${f.name}" is missing executor definition.`,
      }));

    if (!liveMode || bridgeState !== "connected") {
      rejected.push(
        ...accepted.map((f) => ({
          name: f.name,
          code: "AGENT_NOT_CONNECTED",
          message: "Agent is not connected. Commands are unavailable.",
        })),
      );
      setOutboundCanvasBridgeMessage({
        id: generateMessageId(),
        type: "command.bind.result",
        payload: {
          v: 1,
          manifestId: manifest.manifestId,
          accepted: [],
          rejected,
        },
      });
      return;
    }

    setOutboundCanvasBridgeMessage({
      id: generateMessageId(),
      type: "command.bind.result",
      payload: {
        v: 1,
        manifestId: manifest.manifestId,
        accepted,
        rejected,
      },
    });
  }, [manifest, liveMode, bridgeState]);

  const emitCommandFailureToCanvas = useCallback(
    (callId: string | undefined, code: string, message: string) => {
      if (!callId) return;
      setOutboundCanvasBridgeMessage({
        id: generateMessageId(),
        type: "command.result",
        payload: {
          v: 1,
          callId,
          ok: false,
          error: { code, message, retryable: false },
          durationMs: 0,
        },
      });
    },
    [],
  );

  const onCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeInboundMessage) => {
      const callId =
        typeof message.payload.callId === "string" ? message.payload.callId : undefined;

      if (!liveMode || bridgeState !== "connected") {
        emitCommandFailureToCanvas(
          callId,
          "AGENT_NOT_CONNECTED",
          "Agent is not connected. Commands are unavailable.",
        );
        return;
      }

      const bridge = bridgeRef.current;
      if (!bridge) {
        emitCommandFailureToCanvas(
          callId,
          "BRIDGE_UNAVAILABLE",
          "Command failed because live bridge is unavailable.",
        );
        return;
      }

      if (message.type === "command.cancel") {
        const payload = {
          v: typeof message.payload.v === "number" ? message.payload.v : 1,
          callId: callId ?? "",
          reason:
            typeof message.payload.reason === "string" ? message.payload.reason : undefined,
        };
        if (payload.callId.length === 0) return;
        void ensureChannelReady(bridge, CHANNELS.COMMAND).then((ready) => {
          if (!ready) return;
          void bridge.sendWithAck(
            CHANNELS.COMMAND,
            makeEventMessage("command.cancel", payload),
            COMMAND_ACK_TIMEOUT_MS,
          );
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
        emitCommandFailureToCanvas(callId, "INVALID_COMMAND_INVOKE", "Invalid command payload.");
        return;
      }

      void ensureChannelReady(bridge, CHANNELS.COMMAND)
        .then(async (ready) => {
          if (!ready) {
            emitCommandFailureToCanvas(
              invokePayload.callId,
              "COMMAND_CHANNEL_NOT_READY",
              "Command channel is not ready.",
            );
            return;
          }
          const delivered = await bridge.sendWithAck(
            CHANNELS.COMMAND,
            makeEventMessage("command.invoke", invokePayload),
            COMMAND_ACK_TIMEOUT_MS,
          );
          if (!delivered) {
            emitCommandFailureToCanvas(
              invokePayload.callId,
              "COMMAND_DELIVERY_FAILED",
              "Command invocation could not be delivered.",
            );
          }
        })
        .catch(() => {
          emitCommandFailureToCanvas(
            invokePayload.callId,
            "COMMAND_ROUTE_FAILED",
            "Command invocation failed to route to daemon.",
          );
        });
    },
    [bridgeRef, bridgeState, liveMode, emitCommandFailureToCanvas],
  );

  const handleBridgeCommandMessage = useCallback(
    (cm: ChannelMessage) => {
      if (cm.channel !== CHANNELS.COMMAND) return;
      const result = parseCommandResultMessage(cm.message);
      if (result) {
        setOutboundCanvasBridgeMessage({
          id: generateMessageId(),
          type: "command.result",
          payload: result,
        });
      }
    },
    [],
  );

  return {
    handleBridgeCommandMessage,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
  };
}
