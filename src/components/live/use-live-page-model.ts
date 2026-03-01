import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { readCachedCanvasHtml, writeCachedCanvasHtml } from "~/components/live/canvas-live-cache";
import { useLiveVisualState } from "~/components/live/live-visual-state";
import type { LiveViewMode } from "~/components/live/types";
import { useLiveBridge } from "~/components/live/use-live-bridge";
import { useLiveChatDelivery } from "~/components/live/use-live-chat-delivery";
import { useLiveFiles } from "~/components/live/use-live-files";
import { useLivePreferences } from "~/components/live/use-live-preferences";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { CHANNELS, makeBinaryMetaMessage, makeTextMessage } from "~/lib/bridge-protocol";
import type { ChannelMessage } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import { api } from "../../../convex/_generated/api";

const CHAT_ACK_TIMEOUT_MS = 8_000;
const CHAT_CONFIRM_GRACE_MS = 12_000;

export function useLivePageModel(slug: string) {
  const live = useQuery(api.pubs.getLiveBySlug, { slug });
  const storeBrowserSignal = useMutation(api.pubs.storeBrowserSignal);

  const [canvasHtml, setCanvasHtml] = useState<string | null>(() => readCachedCanvasHtml(slug));
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
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
  } = useLivePreferences();
  const { developerModeEnabled, setDeveloperModeEnabled } = useDeveloperMode();

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
  } = useLiveChatDelivery({ confirmGraceMs: CHAT_CONFIRM_GRACE_MS });

  const { addReceivedBinaryFile, clearFiles, files } = useLiveFiles();

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
      }
    },
    [addAgentMessage, addReceivedBinaryFile, autoOpenCanvas, markAgentActivity, slug],
  );

  const handleDeliveryAck = useCallback(
    (ack: { channel: string; messageId: string; receivedAt?: number }) => {
      if (ack.channel !== CHANNELS.CHAT) return;
      setLastUserDeliveredAt(typeof ack.receivedAt === "number" ? ack.receivedAt : Date.now());
      markMessageDelivered(ack.messageId);
    },
    [markMessageDelivered],
  );

  const { bridgeRef, bridgeState } = useLiveBridge({
    agentCandidates: live?.agentCandidates,
    agentOffer: live?.agentOffer,
    onDeliveryAck: handleDeliveryAck,
    onMessage: handleBridgeMessage,
    onTrackActivity: markAgentActivity,
    storeBrowserSignal,
    slug,
  });

  const visualState = useLiveVisualState({
    bridgeState,
    hasCanvasContent: Boolean(canvasHtml),
    isActive: viewMode === "canvas",
    lastAgentActivityAt,
    lastUserDeliveredAt,
  });

  const sendChat = useCallback(
    (text: string) => {
      const bridge = bridgeRef.current;
      if (!bridge) {
        console.warn("Cannot send chat message: live bridge not ready");
        return;
      }
      const msg = makeTextMessage(text);

      addUserPendingMessage({ id: msg.id, content: text });

      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.CHAT);
        if (!ready) {
          console.warn("Cannot send chat message: chat data channel not ready");
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
      if (!bridge) {
        console.warn("Cannot send audio: live bridge not ready");
        return;
      }
      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
        if (!ready) {
          console.warn("Cannot send audio: audio data channel not ready");
          return;
        }
        const buffer = await blob.arrayBuffer();
        const sentMeta = bridge.send(
          CHANNELS.AUDIO,
          makeBinaryMetaMessage({ mime: blob.type, size: buffer.byteLength }),
        );
        if (!sentMeta) {
          console.warn("Failed to send audio metadata");
          return;
        }
        if (!bridge.sendBinary(CHANNELS.AUDIO, buffer)) {
          console.warn("Failed to send audio payload");
        }
      })();
    },
    [bridgeRef],
  );

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
    live: live,
    viewMode,
    visualState,
    voiceModeEnabled,
  };
}
