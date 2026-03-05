import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeAudioBlob } from "~/components/live/audio-waveform";
import { useLiveVisualState } from "~/components/live/live-visual-state";
import type { LiveViewMode, SessionState } from "~/components/live/types";
import { useLiveBridge } from "~/components/live/use-live-bridge";
import { useLiveChatDelivery } from "~/components/live/use-live-chat-delivery";
import { useLiveFiles } from "~/components/live/use-live-files";
import { useLivePreferences } from "~/components/live/use-live-preferences";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import {
  CHANNELS,
  makeStreamEnd,
  makeStreamStart,
  makeTextMessage,
  type SessionContextPayload,
} from "~/lib/bridge-protocol";
import type { ChannelMessage } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import { api } from "../../../convex/_generated/api";

const CHAT_ACK_TIMEOUT_MS = 8_000;
const CHAT_CONFIRM_GRACE_MS = 12_000;
const CONTENT_PREVIEW_MAX_LENGTH = 500;
const SESSION_STORAGE_PREFIX = "pub-live-session:";

function getOrCreateSessionId(slug: string): string {
  const key = `${SESSION_STORAGE_PREFIX}${slug}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

export function useLivePageModel(slug: string) {
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const live = useQuery(api.pubs.getLiveBySlug, { slug });
  const agentOnline = useQuery(api.presence.isAgentOnline, { slug });
  const requestLiveMutation = useMutation(api.pubs.requestLive);
  const storeBrowserCandidatesMutation = useMutation(api.pubs.storeBrowserCandidates);
  const takeoverLiveMutation = useMutation(api.pubs.takeoverLive);

  const browserSessionId = useMemo(() => getOrCreateSessionId(slug), [slug]);

  const [wasConnected, setWasConnected] = useState(false);
  const [liveRequested, setLiveRequested] = useState(false);

  const sessionState: SessionState = useMemo(() => {
    if (!live) return "active";
    if (!live.browserSessionId || live.browserSessionId === browserSessionId) return "active";
    return wasConnected ? "taken-over" : "needs-takeover";
  }, [live, browserSessionId, wasConnected]);

  const storeBrowserOffer = useCallback(
    (input: { slug: string; offer: string }) => {
      return requestLiveMutation({
        slug: input.slug,
        browserSessionId,
        browserOffer: input.offer,
      });
    },
    [requestLiveMutation, browserSessionId],
  );

  const storeBrowserCandidates = useCallback(
    (input: { slug: string; candidates: string[] }) => {
      return storeBrowserCandidatesMutation({
        slug: input.slug,
        sessionId: browserSessionId,
        candidates: input.candidates,
      });
    },
    [storeBrowserCandidatesMutation, browserSessionId],
  );

  const takeoverLive = useCallback(() => {
    return takeoverLiveMutation({ slug, sessionId: browserSessionId });
  }, [takeoverLiveMutation, slug, browserSessionId]);

  const goLive = useCallback(() => {
    setLiveRequested(true);
  }, []);

  const [canvasHtml, setCanvasHtml] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [lastAgentActivityAt, setLastAgentActivityAt] = useState<number | null>(null);
  const [lastUserDeliveredAt, setLastUserDeliveredAt] = useState<number | null>(null);

  const {
    animationStyle,
    autoOpenCanvas,
    micGranted,
    setAnimationStyle,
    setAutoOpenCanvas,
    setMicGranted,
    setShowDeliveryStatus,
    setVoiceModeEnabled,
    showDeliveryStatus,
    voiceModeEnabled,
  } = useLivePreferences();
  const { developerModeEnabled, setDeveloperModeEnabled } = useDeveloperMode();

  const {
    addAgentAudioMessage,
    addAgentImageMessage,
    addAgentMessage,
    addUserPendingAudioMessage,
    addUserPendingMessage,
    clearMessages,
    markMessageConfirmingIfPending,
    markMessageDelivered,
    markMessageFailedIfPending,
    markSendingMessagesConfirming,
    messages,
    messagesEndRef,
    updateAudioMessageAnalysis,
  } = useLiveChatDelivery({ confirmGraceMs: CHAT_CONFIRM_GRACE_MS });

  const sessionContext: SessionContextPayload | undefined = useMemo(() => {
    if (!pub) return undefined;
    const preview = pub.content?.slice(0, CONTENT_PREVIEW_MAX_LENGTH);
    return {
      title: pub.title,
      contentType: pub.contentType,
      contentPreview: preview,
      isPublic: pub.isPublic,
      preferences: { voiceModeEnabled },
    };
  }, [pub, voiceModeEnabled]);

  const { addReceivedBinaryFile, clearFiles, files } = useLiveFiles();

  const pendingChatQueueRef = useRef<Array<{ msg: ReturnType<typeof makeTextMessage> }>>([]);
  const pendingAudioQueueRef = useRef<Blob[]>([]);

  const markAgentActivity = useCallback(() => {
    setLastAgentActivityAt(Date.now());
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: slug triggers state reset on navigation
  useEffect(() => {
    setCanvasHtml(null);
    setViewMode("canvas");
    setLastAgentActivityAt(null);
    setLastUserDeliveredAt(null);
    setWasConnected(false);
    setLiveRequested(false);
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
    enabled: liveRequested && sessionState === "active",
    agentAnswer: sessionState === "active" ? live?.agentAnswer : undefined,
    agentCandidates: sessionState === "active" ? live?.agentCandidates : undefined,
    sessionContext,
    storeBrowserOffer,
    storeBrowserCandidates,
    onDeliveryAck: handleDeliveryAck,
    onMessage: handleBridgeMessage,
    onTrackActivity: markAgentActivity,
  });

  useEffect(() => {
    if (bridgeState === "connected") setWasConnected(true);
  }, [bridgeState]);

  const visualState = useLiveVisualState({
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
  }, [bridgeState, dispatchChatMessage, dispatchAudio]);

  const clearCanvas = useCallback(() => {
    setCanvasHtml(null);
  }, []);

  return {
    agentName: live?.agentName ?? null,
    agentOnline: agentOnline ?? false,
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
    goLive,
    lastTakeoverAt: live?.lastTakeoverAt,
    live,
    liveRequested,
    messages,
    messagesEndRef,
    micGranted,
    sendAudio,
    sendChat,
    sessionState,
    setAnimationStyle,
    setAutoOpenCanvas,
    setDeveloperModeEnabled,
    setMicGranted,
    setShowDeliveryStatus,
    setViewMode,
    setVoiceModeEnabled,
    showDeliveryStatus,
    takeoverLive,
    viewMode,
    visualState,
    voiceModeEnabled,
  };
}
