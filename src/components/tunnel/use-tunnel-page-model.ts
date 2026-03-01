import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { CHANNELS, makeBinaryMetaMessage, makeTextMessage } from "~/lib/bridge-protocol";
import type { ChannelMessage } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import { api } from "../../../convex/_generated/api";

const CHAT_ACK_TIMEOUT_MS = 8_000;
const CHAT_CONFIRM_GRACE_MS = 12_000;

export function useTunnelPageModel(slug: string) {
  const tunnel = useQuery(api.pubs.getSessionBySlug, { slug });
  const storeBrowserSignal = useMutation(api.pubs.storeBrowserSignal);

  const [canvasHtml, setCanvasHtml] = useState<string | null>(() => readCachedCanvasHtml(slug));
  const [viewMode, setViewMode] = useState<TunnelViewMode>("canvas");
  const [lastAgentActivityAt, setLastAgentActivityAt] = useState<number | null>(null);
  const [lastUserDeliveredAt, setLastUserDeliveredAt] = useState<number | null>(null);

  const {
    animationStyle,
    autoOpenCanvas,
    setAnimationStyle,
    setAutoOpenCanvas,
    setShowDeliveryStatus,
    setVoiceModeEnabled,
    showDeliveryStatus,
    voiceModeEnabled,
  } = useTunnelPreferences();
  const { developerModeEnabled, setDeveloperModeEnabled } = useDeveloperMode();

  const {
    addAgentAudioMessage,
    addAgentImageMessage,
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

  const pendingChatQueueRef = useRef<Array<{ msg: ReturnType<typeof makeTextMessage> }>>([]);
  const pendingAudioQueueRef = useRef<Blob[]>([]);

  const markAgentActivity = useCallback(() => {
    setLastAgentActivityAt(Date.now());
  }, []);

  useEffect(() => {
    setCanvasHtml(readCachedCanvasHtml(slug));
    setViewMode("canvas");
    setLastAgentActivityAt(null);
    setLastUserDeliveredAt(null);
    clearMessages();
    clearFiles();
    pendingChatQueueRef.current = [];
    pendingAudioQueueRef.current = [];
  }, [slug, clearFiles, clearMessages]);

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
          writeCachedCanvasHtml(slug, message.data);
          if (autoOpenCanvas) setViewMode("canvas");
          return;
        }
        if (message.type === "event" && message.data === "hide") {
          setCanvasHtml(null);
          writeCachedCanvasHtml(slug, null);
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
        return;
      }

      if (channel === CHANNELS.AUDIO && message.type === "binary" && cm.binaryData) {
        markAgentActivity();
        const mime = typeof message.meta?.mime === "string" ? message.meta.mime : "audio/webm";
        const blob = new Blob([cm.binaryData], { type: mime });
        const audioUrl = URL.createObjectURL(blob);
        addAgentAudioMessage({
          audioUrl,
          id: message.id,
          mime,
          size: cm.binaryData.byteLength,
        });
        return;
      }

      if (channel === CHANNELS.MEDIA && message.type === "binary" && cm.binaryData) {
        markAgentActivity();
        const mime = typeof message.meta?.mime === "string" ? message.meta.mime : "image/png";
        const blob = new Blob([cm.binaryData], { type: mime });
        const imageUrl = URL.createObjectURL(blob);
        addAgentImageMessage({
          id: message.id,
          imageUrl,
          mime,
          width: typeof message.meta?.width === "number" ? message.meta.width : undefined,
          height: typeof message.meta?.height === "number" ? message.meta.height : undefined,
        });
      }
    },
    [
      addAgentAudioMessage,
      addAgentImageMessage,
      addAgentMessage,
      addReceivedBinaryFile,
      autoOpenCanvas,
      markAgentActivity,
      slug,
    ],
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
    slug,
  });

  const visualState = useTunnelSessionVisualState({
    bridgeState,
    hasCanvasContent: Boolean(canvasHtml),
    lastAgentActivityAt,
    lastUserDeliveredAt,
  });

  const dispatchChatMessage = useCallback(
    (msg: ReturnType<typeof makeTextMessage>) => {
      void (async () => {
        const bridge = bridgeRef.current;
        if (!bridge) {
          markMessageFailedIfPending(msg.id);
          return;
        }
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
    [bridgeRef, markMessageConfirmingIfPending, markMessageDelivered, markMessageFailedIfPending],
  );

  const sendChat = useCallback(
    (text: string) => {
      const msg = makeTextMessage(text);
      addUserPendingMessage({ id: msg.id, content: text });
      if (bridgeState !== "connected") {
        pendingChatQueueRef.current.push({ msg });
        return;
      }
      dispatchChatMessage(msg);
    },
    [addUserPendingMessage, bridgeState, dispatchChatMessage],
  );

  useEffect(() => {
    if (bridgeState === "connected") return;
    markSendingMessagesConfirming();
  }, [bridgeState, markSendingMessagesConfirming]);

  const dispatchAudio = useCallback(
    (blob: Blob) => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
        if (!ready) return;
        const buffer = await blob.arrayBuffer();
        const sentMeta = bridge.send(
          CHANNELS.AUDIO,
          makeBinaryMetaMessage({ mime: blob.type, size: buffer.byteLength }),
        );
        if (!sentMeta) return;
        bridge.sendBinary(CHANNELS.AUDIO, buffer);
      })();
    },
    [bridgeRef],
  );

  const sendAudio = useCallback(
    (blob: Blob) => {
      if (bridgeState !== "connected") {
        pendingAudioQueueRef.current.push(blob);
        return;
      }
      dispatchAudio(blob);
    },
    [bridgeState, dispatchAudio],
  );

  useEffect(() => {
    if (bridgeState !== "connected") return;
    const chatQueue = pendingChatQueueRef.current.splice(0);
    for (const { msg } of chatQueue) {
      dispatchChatMessage(msg);
    }
    const audioQueue = pendingAudioQueueRef.current.splice(0);
    for (const blob of audioQueue) {
      dispatchAudio(blob);
    }
  }, [bridgeState, dispatchChatMessage, dispatchAudio]);

  const clearCanvas = useCallback(() => {
    setCanvasHtml(null);
    writeCachedCanvasHtml(slug, null);
  }, [slug]);

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
    developerModeEnabled,
    files,
    messages,
    messagesEndRef,
    sendAudio,
    sendChat,
    setAnimationStyle,
    setAutoOpenCanvas,
    setDeveloperModeEnabled,
    setShowDeliveryStatus,
    setViewMode,
    setVoiceModeEnabled,
    showDeliveryStatus,
    session: tunnel,
    viewMode,
    visualState,
    voiceModeEnabled,
  };
}
