import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveBridge } from "~/features/live/hooks/use-live-bridge";
import {
  CHANNELS,
  makeStreamEnd,
  makeStreamStart,
  makeTextMessage,
  type SessionContextPayload,
} from "~/features/live/lib/bridge-protocol";
import type { ChannelMessage } from "~/features/live/lib/webrtc-browser";
import { ensureChannelReady } from "~/features/live/lib/webrtc-channel";
import type { LiveViewMode } from "~/features/live/types/live-types";
import { analyzeAudioBlob } from "~/features/live/utils/audio-waveform";

const CHAT_ACK_TIMEOUT_MS = 8_000;

interface UseLiveTransportOptions {
  slug: string;
  enabled: boolean;
  agentAnswer: string | undefined;
  agentCandidates: string[] | undefined;
  sessionContext: SessionContextPayload | undefined;
  autoOpenCanvas: boolean;
  storeBrowserOffer: (input: { slug: string; offer: string }) => Promise<unknown>;
  storeBrowserCandidates: (input: { slug: string; candidates: string[] }) => Promise<unknown>;
  addAgentAudioMessage: (params: {
    audioUrl: string;
    id: string;
    mime: string;
    size: number;
  }) => void;
  addAgentImageMessage: (params: {
    height?: number;
    id: string;
    imageUrl: string;
    mime: string;
    width?: number;
  }) => void;
  addAgentMessage: (params: { content: string; id: string; timestamp?: number }) => void;
  addReceivedBinaryFile: (params: {
    binaryData: ArrayBuffer;
    filename?: string;
    id: string;
    mime?: string;
  }) => void;
  addUserPendingAudioMessage: (params: {
    audioUrl: string;
    id: string;
    mime: string;
    size: number;
  }) => void;
  addUserPendingMessage: (params: { content: string; id: string; timestamp?: number }) => void;
  markMessageConfirmingIfPending: (messageId: string) => void;
  markMessageDelivered: (messageId: string) => void;
  markMessageFailedIfPending: (messageId: string) => void;
  markSendingMessagesConfirming: () => void;
  updateAudioMessageAnalysis: (messageId: string, duration: number, waveform: number[]) => void;
}

export function useLiveTransport({
  slug,
  enabled,
  agentAnswer,
  agentCandidates,
  sessionContext,
  autoOpenCanvas,
  storeBrowserOffer,
  storeBrowserCandidates,
  addAgentAudioMessage,
  addAgentImageMessage,
  addAgentMessage,
  addReceivedBinaryFile,
  addUserPendingAudioMessage,
  addUserPendingMessage,
  markMessageConfirmingIfPending,
  markMessageDelivered,
  markMessageFailedIfPending,
  markSendingMessagesConfirming,
  updateAudioMessageAnalysis,
}: UseLiveTransportOptions) {
  const [canvasHtml, setCanvasHtml] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [lastAgentActivityAt, setLastAgentActivityAt] = useState<number | null>(null);
  const [lastUserDeliveredAt, setLastUserDeliveredAt] = useState<number | null>(null);

  const pendingChatQueueRef = useRef<Array<{ msg: ReturnType<typeof makeTextMessage> }>>([]);
  const pendingAudioQueueRef = useRef<Blob[]>([]);

  const markAgentActivity = useCallback(() => {
    setLastAgentActivityAt(Date.now());
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset transport state on slug navigation
  useEffect(() => {
    setCanvasHtml(null);
    setViewMode("canvas");
    setLastAgentActivityAt(null);
    setLastUserDeliveredAt(null);
    pendingChatQueueRef.current = [];
    pendingAudioQueueRef.current = [];
  }, [slug]);

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
          if (autoOpenCanvas) setViewMode("canvas");
          return;
        }
        if (message.type === "event" && message.data === "hide") {
          setCanvasHtml(null);
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
        const audioId = message.id;
        addAgentAudioMessage({ audioUrl, id: audioId, mime, size: cm.binaryData.byteLength });
        analyzeAudioBlob(blob).then(
          ({ duration, peaks }) => updateAudioMessageAnalysis(audioId, duration, peaks),
          (err) => console.warn("Audio analysis failed:", err),
        );
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
      updateAudioMessageAnalysis,
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

  const { bridgeRef, bridgeState } = useLiveBridge({
    slug,
    enabled,
    agentAnswer,
    agentCandidates,
    sessionContext,
    storeBrowserOffer,
    storeBrowserCandidates,
    onDeliveryAck: handleDeliveryAck,
    onMessage: handleBridgeMessage,
    onTrackActivity: markAgentActivity,
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
        const startMsg = makeStreamStart({ mime: blob.type, size: buffer.byteLength });
        if (!bridge.send(CHANNELS.AUDIO, startMsg)) return;

        const chunkSize = 48 * 1024;
        const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const chunk = bytes.slice(offset, offset + chunkSize);
          if (!bridge.sendBinary(CHANNELS.AUDIO, chunk.buffer)) return;
        }

        bridge.send(CHANNELS.AUDIO, makeStreamEnd(startMsg.id));
      })();
    },
    [bridgeRef],
  );

  const sendAudio = useCallback(
    (blob: Blob) => {
      const audioUrl = URL.createObjectURL(blob);
      const id = crypto.randomUUID();
      addUserPendingAudioMessage({
        audioUrl,
        id,
        mime: blob.type || "audio/webm",
        size: blob.size,
      });
      analyzeAudioBlob(blob).then(
        ({ duration, peaks }) => updateAudioMessageAnalysis(id, duration, peaks),
        (err) => console.warn("Audio analysis failed:", err),
      );
      if (bridgeState !== "connected") {
        pendingAudioQueueRef.current.push(blob);
        return;
      }
      dispatchAudio(blob);
    },
    [addUserPendingAudioMessage, bridgeState, dispatchAudio, updateAudioMessageAnalysis],
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
  }, [bridgeState, dispatchAudio, dispatchChatMessage]);

  const clearCanvas = useCallback(() => {
    setCanvasHtml(null);
  }, []);

  return {
    bridgeRef,
    bridgeState,
    canvasHtml,
    clearCanvas,
    lastAgentActivityAt,
    lastUserDeliveredAt,
    sendAudio,
    sendChat,
    setViewMode,
    viewMode,
  };
}
