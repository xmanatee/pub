import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readCachedCanvasHtml, writeCachedCanvasHtml } from "~/components/live/canvas-live-cache";
import { useLiveVisualState } from "~/components/live/live-visual-state";
import type { LiveViewMode, SessionState } from "~/components/live/types";
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
  } = useLiveChatDelivery({ confirmGraceMs: CHAT_CONFIRM_GRACE_MS });

  const { addReceivedBinaryFile, clearFiles, files } = useLiveFiles();

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

  const { bridgeRef, bridgeState } = useLiveBridge({
    slug,
    enabled: liveRequested && sessionState === "active",
    agentAnswer: sessionState === "active" ? live?.agentAnswer : undefined,
    agentCandidates: sessionState === "active" ? live?.agentCandidates : undefined,
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
    sendAudio,
    sendChat,
    sessionState,
    setAnimationStyle,
    setAutoOpenCanvas,
    setDeveloperModeEnabled,
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
