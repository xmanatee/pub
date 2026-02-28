import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import {
  readCachedCanvasHtml,
  writeCachedCanvasHtml,
} from "~/components/tunnel/canvas-session-cache";
import { useTunnelSessionVisualState } from "~/components/tunnel/session-visual-state";
import type { TunnelViewMode } from "~/components/tunnel/types";
import { useTunnelBridge } from "~/components/tunnel/use-tunnel-bridge";
import { useTunnelChatDelivery } from "~/components/tunnel/use-tunnel-chat-delivery";
import { useTunnelFiles } from "~/components/tunnel/use-tunnel-files";
import { useTunnelPreferences } from "~/components/tunnel/use-tunnel-preferences";
import { CHANNELS, makeBinaryMetaMessage, makeTextMessage } from "~/lib/bridge-protocol";
import type { ChannelMessage } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import { api } from "../../../convex/_generated/api";

const CHAT_ACK_TIMEOUT_MS = 8_000;
const CHAT_CONFIRM_GRACE_MS = 12_000;

export function useTunnelPageModel(tunnelId: string) {
  const tunnel = useQuery(api.tunnels.getByTunnelId, { tunnelId });
  const storeBrowserSignal = useMutation(api.tunnels.storeBrowserSignal);

  const [canvasHtml, setCanvasHtml] = useState<string | null>(() => readCachedCanvasHtml(tunnelId));
  const [viewMode, setViewMode] = useState<TunnelViewMode>("canvas");
  const [lastAgentActivityAt, setLastAgentActivityAt] = useState<number | null>(null);
  const [lastUserDeliveredAt, setLastUserDeliveredAt] = useState<number | null>(null);

  const {
    animationStyle,
    autoOpenCanvas,
    setAnimationStyle,
    setAutoOpenCanvas,
    setShowDeliveryStatus,
    showDeliveryStatus,
  } = useTunnelPreferences();

  const {
    addAgentMessage,
    addUserPendingMessage,
    clearMessages,
    markMessageConfirmingIfPending,
    markMessageDelivered,
    markMessageFailedIfPending,
    markSendingMessagesConfirming,
    messages,
    messagesEndRef,
  } = useTunnelChatDelivery({ confirmGraceMs: CHAT_CONFIRM_GRACE_MS });

  const { addReceivedBinaryFile, clearFiles, files } = useTunnelFiles();

  const markAgentActivity = useCallback(() => {
    setLastAgentActivityAt(Date.now());
  }, []);

  useEffect(() => {
    setCanvasHtml(readCachedCanvasHtml(tunnelId));
    setViewMode("canvas");
    setLastAgentActivityAt(null);
    setLastUserDeliveredAt(null);
    clearMessages();
    clearFiles();
  }, [tunnelId, clearFiles, clearMessages]);

  const handleBridgeMessage = useCallback(
    (cm: ChannelMessage) => {
      const { channel, message } = cm;
      if (channel === CHANNELS.CHAT && message.type === "text" && message.data) {
        markAgentActivity();
        addAgentMessage({ id: message.id, content: message.data });
        return;
      }

      if (channel === CHANNELS.CANVAS) {
        markAgentActivity();
        if (message.type === "html" && message.data) {
          setCanvasHtml(message.data);
          writeCachedCanvasHtml(tunnelId, message.data);
          if (autoOpenCanvas) setViewMode("canvas");
          return;
        }
        if (message.type === "event" && message.data === "hide") {
          setCanvasHtml(null);
          writeCachedCanvasHtml(tunnelId, null);
        }
        return;
      }

      if (channel === CHANNELS.FILE && message.type === "binary" && cm.binaryData) {
        markAgentActivity();
        addReceivedBinaryFile({
          binaryData: cm.binaryData,
          filename: typeof message.meta?.filename === "string" ? message.meta.filename : undefined,
          id: message.id,
          mime: typeof message.meta?.mime === "string" ? message.meta.mime : undefined,
        });
      }
    },
    [addAgentMessage, addReceivedBinaryFile, autoOpenCanvas, markAgentActivity, tunnelId],
  );

  const handleDeliveryAck = useCallback(
    (ack: { channel: string; messageId: string; receivedAt?: number }) => {
      if (ack.channel !== CHANNELS.CHAT) return;
      setLastUserDeliveredAt(typeof ack.receivedAt === "number" ? ack.receivedAt : Date.now());
      markMessageDelivered(ack.messageId);
    },
    [markMessageDelivered],
  );

  const { bridgeRef, bridgeState } = useTunnelBridge({
    agentCandidates: tunnel?.agentCandidates,
    agentOffer: tunnel?.agentOffer,
    onDeliveryAck: handleDeliveryAck,
    onMessage: handleBridgeMessage,
    onTrackActivity: markAgentActivity,
    storeBrowserSignal,
    tunnelId,
  });

  const visualState = useTunnelSessionVisualState({
    bridgeState,
    hasCanvasContent: Boolean(canvasHtml),
    isActive: viewMode === "canvas",
    lastAgentActivityAt,
    lastUserDeliveredAt,
  });

  const sendChat = useCallback(
    (text: string) => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const msg = makeTextMessage(text);

      addUserPendingMessage({ id: msg.id, content: text });

      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.CHAT);
        if (!ready) {
          markMessageFailedIfPending(msg.id);
          return;
        }

        const delivered = await bridge.sendWithAck(CHANNELS.CHAT, msg, CHAT_ACK_TIMEOUT_MS);
        if (delivered) {
          setLastUserDeliveredAt(Date.now());
          markMessageDelivered(msg.id);
          return;
        }

        markMessageConfirmingIfPending(msg.id);
      })();
    },
    [
      addUserPendingMessage,
      bridgeRef,
      markMessageConfirmingIfPending,
      markMessageDelivered,
      markMessageFailedIfPending,
    ],
  );

  useEffect(() => {
    if (bridgeState === "connected") return;
    markSendingMessagesConfirming();
  }, [bridgeState, markSendingMessagesConfirming]);

  const sendAudio = useCallback(
    (blob: Blob) => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
        if (!ready) return;
        const buffer = await blob.arrayBuffer();
        bridge.send(
          CHANNELS.AUDIO,
          makeBinaryMetaMessage({ mime: blob.type, size: buffer.byteLength }),
        );
        bridge.sendBinary(CHANNELS.AUDIO, buffer);
      })();
    },
    [bridgeRef],
  );

  const clearCanvas = useCallback(() => {
    setCanvasHtml(null);
    writeCachedCanvasHtml(tunnelId, null);
  }, [tunnelId]);

  return {
    animationStyle,
    autoOpenCanvas,
    bridgeRef,
    bridgeState,
    canvasHtml,
    clearCanvas,
    clearFiles,
    clearMessages,
    connected: bridgeState === "connected",
    files,
    messages,
    messagesEndRef,
    sendAudio,
    sendChat,
    setAnimationStyle,
    setAutoOpenCanvas,
    setShowDeliveryStatus,
    setViewMode,
    showDeliveryStatus,
    tunnel,
    viewMode,
    visualState,
  };
}
