import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHANNELS,
  generateMessageId,
  makeEventMessage,
} from "~/features/live/lib/bridge-protocol";
import {
  parseCommandBindResultMessage,
  parseCommandResultMessage,
} from "~/features/live/lib/command-protocol";
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

  const commandProcessingQueueRef = useRef<Promise<void>>(Promise.resolve());
  const boundManifestIdRef = useRef<string | null>(null);
  const pendingBindRef = useRef<{
    manifestId: string;
    functions: unknown[];
    v: number;
  } | null>(null);

  const manifest = useMemo(() => (html ? parseCanvasManifest(html) : null), [html]);

  useEffect(() => {
    boundManifestIdRef.current = null;
    pendingBindRef.current = manifest
      ? { manifestId: manifest.manifestId, functions: manifest.functions, v: manifest.v }
      : null;
  }, [manifest]);

  useEffect(() => {
    if (bridgeState !== "connected" || !liveMode) return;
    const pending = pendingBindRef.current;
    if (!pending || boundManifestIdRef.current === pending.manifestId) return;

    commandProcessingQueueRef.current = commandProcessingQueueRef.current
      .then(async () => {
        const bridge = bridgeRef.current;
        if (!bridge) return;
        const ready = await ensureChannelReady(bridge, CHANNELS.COMMAND);
        if (!ready) return;

        const delivered = await bridge.sendWithAck(
          CHANNELS.COMMAND,
          makeEventMessage("command.bind", {
            v: pending.v,
            manifestId: pending.manifestId,
            functions: pending.functions,
          }),
          COMMAND_ACK_TIMEOUT_MS,
        );
        if (!delivered) {
          setOutboundCanvasBridgeMessage({
            id: generateMessageId(),
            type: "command.bind.result",
            payload: {
              v: 1,
              manifestId: pending.manifestId,
              accepted: [],
              rejected: [
                {
                  name: "*",
                  code: "BIND_DELIVERY_FAILED",
                  message: "Failed to deliver command manifest to daemon.",
                },
              ],
            },
          });
        }
      })
      .catch(() => {});
  }, [bridgeState, liveMode, bridgeRef, manifest]);

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

      commandProcessingQueueRef.current = commandProcessingQueueRef.current
        .then(async () => {
          const ready = await ensureChannelReady(bridge, CHANNELS.COMMAND);
          if (!ready) {
            emitCommandFailureToCanvas(
              callId,
              "COMMAND_CHANNEL_NOT_READY",
              "Command channel is not ready.",
            );
            return;
          }

          if (message.type === "command.bind") {
            const bindPayload = {
              v: typeof message.payload.v === "number" ? message.payload.v : 1,
              manifestId:
                typeof message.payload.manifestId === "string" &&
                message.payload.manifestId.length > 0
                  ? message.payload.manifestId
                  : `manifest-${generateMessageId()}`,
              functions: Array.isArray(message.payload.functions) ? message.payload.functions : [],
            };
            const delivered = await bridge.sendWithAck(
              CHANNELS.COMMAND,
              makeEventMessage("command.bind", bindPayload),
              COMMAND_ACK_TIMEOUT_MS,
            );
            if (delivered) {
              boundManifestIdRef.current = bindPayload.manifestId;
            } else {
              setOutboundCanvasBridgeMessage({
                id: generateMessageId(),
                type: "command.bind.result",
                payload: {
                  v: 1,
                  manifestId: bindPayload.manifestId,
                  accepted: [],
                  rejected: [
                    {
                      name: "*",
                      code: "BIND_DELIVERY_FAILED",
                      message: "Failed to deliver command manifest to daemon.",
                    },
                  ],
                },
              });
            }
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
            await bridge.sendWithAck(
              CHANNELS.COMMAND,
              makeEventMessage("command.cancel", payload),
              COMMAND_ACK_TIMEOUT_MS,
            );
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
        .catch((error) => {
          console.warn("Failed to route canvas command bridge event", error);
          emitCommandFailureToCanvas(
            callId,
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
      commandProcessingQueueRef.current = commandProcessingQueueRef.current.then(() => {
        const bindResult = parseCommandBindResultMessage(cm.message);
        if (bindResult) {
          boundManifestIdRef.current = bindResult.manifestId;
          setOutboundCanvasBridgeMessage({
            id: generateMessageId(),
            type: "command.bind.result",
            payload: bindResult,
          });
          return;
        }
        const result = parseCommandResultMessage(cm.message);
        if (result) {
          setOutboundCanvasBridgeMessage({
            id: generateMessageId(),
            type: "command.result",
            payload: result,
          });
        }
      });
    },
    [],
  );

  return {
    handleBridgeCommandMessage,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
  };
}
