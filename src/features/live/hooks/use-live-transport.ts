import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveBridge } from "~/features/live/hooks/use-live-bridge";
import {
  CHANNELS,
  generateMessageId,
  makeHtmlMessage,
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
const STREAM_ACK_TIMEOUT_MS = 10_000;
const STREAM_CHUNK_SIZE = 48 * 1024;

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
  addUserPendingAttachmentMessage: (params: {
    fileUrl?: string;
    filename: string;
    id: string;
    mime: string;
    size: number;
  }) => void;
  addUserPendingImageMessage: (params: {
    height?: number;
    id: string;
    imageUrl: string;
    mime: string;
    size: number;
    width?: number;
  }) => void;
  addUserPendingMessage: (params: { content: string; id: string; timestamp?: number }) => void;
  markMessageConfirmed: (messageId: string) => void;
  markMessageFailed: (messageId: string) => void;
  markMessageFailedIfPending: (messageId: string) => void;
  markMessageReceived: (messageId: string) => void;
  markMessageSentIfPending: (messageId: string) => void;
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
  addUserPendingAttachmentMessage,
  addUserPendingAudioMessage,
  addUserPendingImageMessage,
  addUserPendingMessage,
  markMessageConfirmed,
  markMessageFailed,
  markMessageFailedIfPending,
  markMessageReceived,
  markMessageSentIfPending,
  updateAudioMessageAnalysis,
}: UseLiveTransportOptions) {
  const [canvasHtml, setCanvasHtml] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [lastAgentActivityAt, setLastAgentActivityAt] = useState<number | null>(null);
  const [lastUserDeliveredAt, setLastUserDeliveredAt] = useState<number | null>(null);

  const pendingChatQueueRef = useRef<Array<{ msg: ReturnType<typeof makeTextMessage> }>>([]);
  const pendingAudioQueueRef = useRef<Array<{ blob: Blob; id: string }>>([]);
  const pendingFileQueueRef = useRef<
    Array<{
      channel: "file" | "media";
      file: File;
      id: string;
    }>
  >([]);

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
    pendingFileQueueRef.current = [];
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

  const handleDeliveryReceipt = useCallback(
    (receipt: { channel: string; messageId: string; stage: "received" | "confirmed" | "failed" }) => {
      if (
        receipt.channel !== CHANNELS.CHAT &&
        receipt.channel !== CHANNELS.AUDIO &&
        receipt.channel !== CHANNELS.MEDIA &&
        receipt.channel !== CHANNELS.FILE
      ) {
        return;
      }
      if (receipt.stage === "received") {
        setLastUserDeliveredAt(Date.now());
        markMessageReceived(receipt.messageId);
        return;
      }
      if (receipt.stage === "confirmed") {
        markMessageConfirmed(receipt.messageId);
        return;
      }
      markMessageFailed(receipt.messageId);
    },
    [markMessageConfirmed, markMessageFailed, markMessageReceived],
  );

  const { bridgeRef, bridgeState } = useLiveBridge({
    slug,
    enabled,
    agentAnswer,
    agentCandidates,
    sessionContext,
    storeBrowserOffer,
    storeBrowserCandidates,
    onDeliveryReceipt: handleDeliveryReceipt,
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
          markMessageSentIfPending(msg.id);
          return;
        }

        markMessageFailedIfPending(msg.id);
      })();
    },
    [bridgeRef, markMessageFailedIfPending, markMessageSentIfPending],
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

  const dispatchAudio = useCallback(
    (blob: Blob, id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge) {
        markMessageFailedIfPending(id);
        return;
      }
      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
        if (!ready) {
          markMessageFailedIfPending(id);
          return;
        }
        const buffer = await blob.arrayBuffer();
        const startMsg = makeStreamStart({ mime: blob.type, size: buffer.byteLength }, id);
        if (!bridge.send(CHANNELS.AUDIO, startMsg)) {
          markMessageFailedIfPending(id);
          return;
        }

        const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += STREAM_CHUNK_SIZE) {
          const chunk = bytes.slice(offset, offset + STREAM_CHUNK_SIZE);
          if (!bridge.sendBinary(CHANNELS.AUDIO, chunk.buffer)) {
            markMessageFailedIfPending(id);
            return;
          }
        }

        const ended = await bridge.sendWithAck(
          CHANNELS.AUDIO,
          makeStreamEnd(startMsg.id),
          STREAM_ACK_TIMEOUT_MS,
        );
        if (!ended) {
          markMessageFailedIfPending(id);
          return;
        }

        markMessageSentIfPending(id);
      })();
    },
    [bridgeRef, markMessageFailedIfPending, markMessageSentIfPending],
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
        pendingAudioQueueRef.current.push({ blob, id });
        return;
      }
      dispatchAudio(blob, id);
    },
    [addUserPendingAudioMessage, bridgeState, dispatchAudio, updateAudioMessageAnalysis],
  );

  const dispatchFile = useCallback(
    (file: File, id: string, channel: "file" | "media") => {
      const bridge = bridgeRef.current;
      if (!bridge) {
        markMessageFailedIfPending(id);
        return;
      }

      void (async () => {
        const ready = await ensureChannelReady(bridge, channel);
        if (!ready) {
          markMessageFailedIfPending(id);
          return;
        }
        const buffer = await file.arrayBuffer();
        const startMsg = makeStreamStart(
          {
            filename: file.name,
            mime: file.type || "application/octet-stream",
            size: buffer.byteLength,
          },
          id,
        );
        if (!bridge.send(channel, startMsg)) {
          markMessageFailedIfPending(id);
          return;
        }

        const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += STREAM_CHUNK_SIZE) {
          const chunk = bytes.slice(offset, offset + STREAM_CHUNK_SIZE);
          if (!bridge.sendBinary(channel, chunk.buffer)) {
            markMessageFailedIfPending(id);
            return;
          }
        }

        const ended = await bridge.sendWithAck(channel, makeStreamEnd(startMsg.id), STREAM_ACK_TIMEOUT_MS);
        if (!ended) {
          markMessageFailedIfPending(id);
          return;
        }

        markMessageSentIfPending(id);
      })();
    },
    [bridgeRef, markMessageFailedIfPending, markMessageSentIfPending],
  );

  const sendFile = useCallback(
    (file: File) => {
      const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
      if (isHtml) {
        const bridge = bridgeRef.current;
        if (!bridge) return;
        void (async () => {
          const text = await file.text();
          const ready = await ensureChannelReady(bridge, CHANNELS.CANVAS);
          if (!ready) return;
          bridge.send(CHANNELS.CANVAS, makeHtmlMessage(text, file.name));
        })();
        return;
      }

      const id = generateMessageId();
      const mime = file.type || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const fileUrl = URL.createObjectURL(file);
      if (isImage) {
        addUserPendingImageMessage({
          id,
          imageUrl: fileUrl,
          mime,
          size: file.size,
        });
      } else {
        addUserPendingAttachmentMessage({
          id,
          filename: file.name,
          mime,
          size: file.size,
          fileUrl,
        });
      }

      const channel = isImage ? CHANNELS.MEDIA : CHANNELS.FILE;
      if (bridgeState !== "connected") {
        pendingFileQueueRef.current.push({ channel, file, id });
        return;
      }
      dispatchFile(file, id, channel);
    },
    [
      addUserPendingAttachmentMessage,
      addUserPendingImageMessage,
      bridgeRef,
      bridgeState,
      dispatchFile,
    ],
  );

  useEffect(() => {
    if (bridgeState !== "connected") return;

    const chatQueue = pendingChatQueueRef.current.splice(0);
    for (const { msg } of chatQueue) {
      dispatchChatMessage(msg);
    }

    const audioQueue = pendingAudioQueueRef.current.splice(0);
    for (const entry of audioQueue) {
      dispatchAudio(entry.blob, entry.id);
    }

    const fileQueue = pendingFileQueueRef.current.splice(0);
    for (const entry of fileQueue) {
      dispatchFile(entry.file, entry.id, entry.channel);
    }
  }, [bridgeState, dispatchAudio, dispatchChatMessage, dispatchFile]);

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
    sendFile,
    setViewMode,
    viewMode,
  };
}
