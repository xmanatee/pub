import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasPanel } from "~/components/tunnel/canvas-panel";
import {
  readCachedCanvasHtml,
  writeCachedCanvasHtml,
} from "~/components/tunnel/canvas-session-cache";
import { ChatPanel } from "~/components/tunnel/chat-panel";
import { ControlBar } from "~/components/tunnel/control-bar";
import { useTunnelSessionVisualState } from "~/components/tunnel/session-visual-state";
import { SettingsPanel } from "~/components/tunnel/settings-panel";
import type { ChatEntry, ReceivedFile, TunnelViewMode } from "~/components/tunnel/types";
import { useTunnelPreferences } from "~/components/tunnel/use-tunnel-preferences";
import { CHANNELS, makeBinaryMetaMessage, makeTextMessage } from "~/lib/bridge-protocol";
import type { BridgeState, ChannelMessage } from "~/lib/webrtc-browser";
import { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/t/$tunnelId")({
  component: TunnelPage,
});

const CHAT_ACK_TIMEOUT_MS = 8_000;
const CHAT_CONFIRM_GRACE_MS = 12_000;

function TunnelPage() {
  const { tunnelId } = Route.useParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) void navigate({ to: "/login" });
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) return <StatusScreen text="Checking authentication..." />;
  if (!isAuthenticated) return <StatusScreen text="Redirecting to login..." />;
  return <TunnelPageInner tunnelId={tunnelId} />;
}

function TunnelPageInner({ tunnelId }: { tunnelId: string }) {
  const tunnel = useQuery(api.tunnels.getByTunnelId, { tunnelId });
  const storeBrowserSignal = useMutation(api.tunnels.storeBrowserSignal);

  const bridgeRef = useRef<BrowserBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [files, setFiles] = useState<ReceivedFile[]>([]);
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

  const lastAgentCandidateCount = useRef(0);
  const lastHandledOffer = useRef<string | null>(null);
  const localIceFlushInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const localIceStopTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeliveryFailureTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const fileUrlsRef = useRef<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const addMessage = useCallback(
    (entry: ChatEntry) => {
      setMessages((prev) => [...prev, entry]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const markAgentActivity = useCallback(() => {
    setLastAgentActivityAt(Date.now());
  }, []);

  const visualState = useTunnelSessionVisualState({
    bridgeState,
    hasCanvasContent: Boolean(canvasHtml),
    isActive: viewMode === "canvas",
    lastAgentActivityAt,
    lastUserDeliveredAt,
  });

  const clearPendingDeliveryFailureTimer = useCallback((messageId: string) => {
    const pending = pendingDeliveryFailureTimersRef.current.get(messageId);
    if (!pending) return;
    clearTimeout(pending);
    pendingDeliveryFailureTimersRef.current.delete(messageId);
  }, []);

  const markMessageDelivered = useCallback(
    (messageId: string) => {
      clearPendingDeliveryFailureTimer(messageId);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.from === "user" && entry.id === messageId
            ? { ...entry, delivery: "delivered" }
            : entry,
        ),
      );
    },
    [clearPendingDeliveryFailureTimer],
  );

  const markMessageConfirmingIfPending = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" &&
        entry.id === messageId &&
        (entry.delivery === "sending" || entry.delivery === "confirming")
          ? { ...entry, delivery: "confirming" }
          : entry,
      ),
    );
  }, []);

  const markMessageFailedIfPending = useCallback(
    (messageId: string) => {
      clearPendingDeliveryFailureTimer(messageId);

      setMessages((prev) =>
        prev.map((entry) =>
          entry.from === "user" &&
          entry.id === messageId &&
          (entry.delivery === "sending" || entry.delivery === "confirming")
            ? { ...entry, delivery: "failed" }
            : entry,
        ),
      );
    },
    [clearPendingDeliveryFailureTimer],
  );

  useEffect(() => {
    setCanvasHtml(readCachedCanvasHtml(tunnelId));
  }, [tunnelId]);

  useEffect(() => {
    return () => {
      for (const timeout of pendingDeliveryFailureTimersRef.current.values()) {
        clearTimeout(timeout);
      }
      pendingDeliveryFailureTimersRef.current.clear();
      for (const url of fileUrlsRef.current) URL.revokeObjectURL(url);
      fileUrlsRef.current = [];
    };
  }, []);

  const handleBridgeMessage = useCallback(
    (cm: ChannelMessage) => {
      const { channel, message } = cm;
      if (channel === CHANNELS.CHAT && message.type === "text" && message.data) {
        markAgentActivity();
        addMessage({ id: message.id, from: "agent", content: message.data, timestamp: Date.now() });
      } else if (channel === CHANNELS.CANVAS) {
        markAgentActivity();
        if (message.type === "html" && message.data) {
          setCanvasHtml(message.data);
          writeCachedCanvasHtml(tunnelId, message.data);
          if (autoOpenCanvas) {
            setViewMode("canvas");
          }
        } else if (message.type === "event" && message.data === "hide") {
          setCanvasHtml(null);
          writeCachedCanvasHtml(tunnelId, null);
        }
      } else if (channel === CHANNELS.FILE && message.type === "binary" && cm.binaryData) {
        markAgentActivity();
        const filename =
          typeof message.meta?.filename === "string" ? message.meta.filename : "download.bin";
        const mime =
          typeof message.meta?.mime === "string" ? message.meta.mime : "application/octet-stream";
        const blob = new Blob([cm.binaryData], { type: mime });
        const downloadUrl = URL.createObjectURL(blob);
        fileUrlsRef.current.push(downloadUrl);
        setFiles((prev) => [
          ...prev,
          {
            id: message.id,
            filename,
            mime,
            size: cm.binaryData?.byteLength ?? 0,
            downloadUrl,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [addMessage, autoOpenCanvas, markAgentActivity, tunnelId],
  );

  useEffect(() => {
    const agentOffer = tunnel?.agentOffer;
    if (!agentOffer || lastHandledOffer.current === agentOffer) return;
    lastHandledOffer.current = agentOffer;

    const bridge = new BrowserBridge();
    bridgeRef.current = bridge;
    lastAgentCandidateCount.current = 0;
    bridge.setOnStateChange(setBridgeState);
    bridge.setOnMessage(handleBridgeMessage);
    bridge.setOnTrack(() => markAgentActivity());
    bridge.setOnDeliveryAck((ack) => {
      if (ack.channel !== CHANNELS.CHAT) return;
      setLastUserDeliveredAt(typeof ack.receivedAt === "number" ? ack.receivedAt : Date.now());
      markMessageDelivered(ack.messageId);
    });

    void (async () => {
      try {
        const answer = await bridge.createAnswer(agentOffer);
        await storeBrowserSignal({ tunnelId, answer });
        const candidates = bridge.getIceCandidates();
        if (candidates.length > 0) await storeBrowserSignal({ tunnelId, candidates });

        if (localIceFlushInterval.current) clearInterval(localIceFlushInterval.current);
        if (localIceStopTimeout.current) clearTimeout(localIceStopTimeout.current);

        const flushLocalCandidates = async () => {
          try {
            const current = bridge.getIceCandidates();
            if (current.length <= candidates.length) return;
            const nc = current.slice(candidates.length);
            candidates.push(...nc);
            await storeBrowserSignal({ tunnelId, candidates: nc });
          } catch (error) {
            // Ignore transient signaling write failures; next interval retries.
            console.warn("Failed to store local ICE candidates", error);
          }
        };

        localIceFlushInterval.current = setInterval(() => {
          void flushLocalCandidates();
        }, 500);

        localIceStopTimeout.current = setTimeout(() => {
          if (localIceFlushInterval.current) {
            clearInterval(localIceFlushInterval.current);
            localIceFlushInterval.current = null;
          }
          localIceStopTimeout.current = null;
        }, 30_000);
      } catch (error) {
        // Failed to establish WebRTC answer/signaling for this offer.
        console.error("Failed to establish tunnel WebRTC bridge", error);
        setBridgeState("disconnected");
      }
    })();

    return () => {
      if (localIceFlushInterval.current) {
        clearInterval(localIceFlushInterval.current);
        localIceFlushInterval.current = null;
      }
      if (localIceStopTimeout.current) {
        clearTimeout(localIceStopTimeout.current);
        localIceStopTimeout.current = null;
      }
      bridge.close();
      bridgeRef.current = null;
    };
  }, [
    tunnel?.agentOffer,
    tunnelId,
    storeBrowserSignal,
    handleBridgeMessage,
    markAgentActivity,
    markMessageDelivered,
  ]);

  useEffect(() => {
    const confirmingIds = new Set(
      messages
        .filter((entry) => entry.from === "user" && entry.delivery === "confirming")
        .map((entry) => entry.id),
    );

    for (const messageId of confirmingIds) {
      if (pendingDeliveryFailureTimersRef.current.has(messageId)) continue;
      const timeout = setTimeout(() => {
        markMessageFailedIfPending(messageId);
      }, CHAT_CONFIRM_GRACE_MS);
      pendingDeliveryFailureTimersRef.current.set(messageId, timeout);
    }

    for (const [messageId, timeout] of pendingDeliveryFailureTimersRef.current) {
      if (confirmingIds.has(messageId)) continue;
      clearTimeout(timeout);
      pendingDeliveryFailureTimersRef.current.delete(messageId);
    }
  }, [messages, markMessageFailedIfPending]);

  useEffect(() => {
    if (!tunnel?.agentCandidates || !bridgeRef.current) return;
    const nc = tunnel.agentCandidates.slice(lastAgentCandidateCount.current);
    if (nc.length > 0) {
      lastAgentCandidateCount.current = tunnel.agentCandidates.length;
      void bridgeRef.current.addRemoteCandidates(nc);
    }
  }, [tunnel?.agentCandidates]);

  const sendChat = useCallback(
    (text: string) => {
      if (!bridgeRef.current) return;
      const bridge = bridgeRef.current;
      const msg = makeTextMessage(text);

      addMessage({
        id: msg.id,
        from: "user",
        content: text,
        timestamp: Date.now(),
        delivery: "sending",
      });

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
    [addMessage, markMessageConfirmingIfPending, markMessageDelivered, markMessageFailedIfPending],
  );

  useEffect(() => {
    if (bridgeState === "connected") return;
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" && entry.delivery === "sending"
          ? { ...entry, delivery: "confirming" }
          : entry,
      ),
    );
  }, [bridgeState]);

  const sendAudio = useCallback((blob: Blob) => {
    if (!bridgeRef.current) return;
    const bridge = bridgeRef.current;
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
  }, []);

  const clearFiles = useCallback(() => {
    for (const url of fileUrlsRef.current) URL.revokeObjectURL(url);
    fileUrlsRef.current = [];
    setFiles([]);
  }, []);

  if (tunnel === undefined) return <StatusScreen text="Loading..." />;
  if (tunnel === null) return <StatusScreen text="Tunnel not found or expired." />;
  if (!tunnel.agentOffer && !canvasHtml) return <StatusScreen text="Waiting for agent..." />;

  const connected = bridgeState === "connected";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
      <div className="flex-1 min-h-0 relative">
        {viewMode === "canvas" ? (
          <CanvasPanel
            animationStyle={animationStyle}
            html={canvasHtml}
            visualState={visualState}
          />
        ) : null}
        {viewMode === "chat" ? (
          <ChatPanel
            files={files}
            messages={messages}
            messagesEndRef={messagesEndRef}
            showDeliveryStatus={showDeliveryStatus}
          />
        ) : null}
        {viewMode === "settings" ? (
          <SettingsPanel
            autoOpenCanvas={autoOpenCanvas}
            animationStyle={animationStyle}
            fileCount={files.length}
            messageCount={messages.length}
            onAutoOpenCanvasChange={setAutoOpenCanvas}
            onAnimationStyleChange={setAnimationStyle}
            onClearFiles={clearFiles}
            onClearMessages={() => setMessages([])}
            onShowDeliveryStatusChange={setShowDeliveryStatus}
            showDeliveryStatus={showDeliveryStatus}
          />
        ) : null}
      </div>

      <ControlBar
        disabled={!connected}
        bridge={bridgeRef.current}
        onSendAudio={sendAudio}
        onSendChat={sendChat}
        onChangeView={setViewMode}
        viewMode={viewMode}
      />
    </div>
  );
}

function StatusScreen({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">{text}</div>
    </div>
  );
}
