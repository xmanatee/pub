import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { FileDown } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { MessageBar } from "~/components/tunnel/message-bar";
import { Button } from "~/components/ui/button";
import { CHANNELS, makeBinaryMetaMessage, makeTextMessage } from "~/lib/bridge-protocol";
import type { BridgeState, ChannelMessage } from "~/lib/webrtc-browser";
import { BrowserBridge } from "~/lib/webrtc-browser";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/t/$tunnelId")({
  component: TunnelPage,
});

interface ChatEntry {
  id: string;
  from: "user" | "agent";
  content: string;
  timestamp: number;
}

interface ReceivedFile {
  id: string;
  filename: string;
  mime: string;
  size: number;
  downloadUrl: string;
  timestamp: number;
}

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
  const [canvasHtml, setCanvasHtml] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState(true);
  const lastAgentCandidateCount = useRef(0);
  const lastHandledOffer = useRef<string | null>(null);
  const localIceFlushInterval = useRef<ReturnType<typeof setInterval> | null>(null);
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

  useEffect(() => {
    return () => {
      for (const url of fileUrlsRef.current) URL.revokeObjectURL(url);
      fileUrlsRef.current = [];
    };
  }, []);

  const handleBridgeMessage = useCallback(
    (cm: ChannelMessage) => {
      const { channel, message } = cm;
      if (channel === CHANNELS.CHAT && message.type === "text" && message.data) {
        addMessage({ id: message.id, from: "agent", content: message.data, timestamp: Date.now() });
      } else if (channel === CHANNELS.CANVAS) {
        if (message.type === "html" && message.data) {
          setCanvasHtml(message.data);
          setCanvasMode(true);
        } else if (message.type === "event" && message.data === "hide") {
          setCanvasHtml(null);
          setCanvasMode(false);
        }
      } else if (channel === CHANNELS.FILE && message.type === "binary" && cm.binaryData) {
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
    [addMessage],
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

    void (async () => {
      try {
        const answer = await bridge.createAnswer(agentOffer);
        await storeBrowserSignal({ tunnelId, answer });
        const candidates = bridge.getIceCandidates();
        if (candidates.length > 0) await storeBrowserSignal({ tunnelId, candidates });

        if (localIceFlushInterval.current) clearInterval(localIceFlushInterval.current);
        localIceFlushInterval.current = setInterval(() => {
          void (async () => {
            try {
              const current = bridge.getIceCandidates();
              if (current.length > candidates.length) {
                const nc = current.slice(candidates.length);
                candidates.push(...nc);
                await storeBrowserSignal({ tunnelId, candidates: nc });
              }
            } catch {}
          })();
        }, 500);
        setTimeout(() => {
          if (localIceFlushInterval.current) {
            clearInterval(localIceFlushInterval.current);
            localIceFlushInterval.current = null;
          }
        }, 30_000);
      } catch {
        setBridgeState("disconnected");
      }
    })();

    return () => {
      if (localIceFlushInterval.current) {
        clearInterval(localIceFlushInterval.current);
        localIceFlushInterval.current = null;
      }
      bridge.close();
      bridgeRef.current = null;
    };
  }, [tunnel?.agentOffer, tunnelId, storeBrowserSignal, handleBridgeMessage]);

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
      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.CHAT);
        if (!ready) return;
        const msg = makeTextMessage(text);
        if (!bridge.send(CHANNELS.CHAT, msg)) return;
        addMessage({ id: msg.id, from: "user", content: text, timestamp: Date.now() });
      })();
    },
    [addMessage],
  );

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

  if (tunnel === undefined) return <StatusScreen text="Loading..." />;
  if (tunnel === null) return <StatusScreen text="Tunnel not found or expired." />;
  if (!tunnel.agentOffer) return <StatusScreen text="Waiting for agent..." />;

  const connected = bridgeState === "connected";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground">
      <div className="flex-1 min-h-0 relative">
        {canvasMode ? (
          <CanvasPanel html={canvasHtml} />
        ) : (
          <ChatPanel messages={messages} files={files} messagesEndRef={messagesEndRef} />
        )}
      </div>
      <MessageBar
        disabled={!connected}
        bridge={bridgeRef.current}
        onSendChat={sendChat}
        onSendAudio={sendAudio}
        canvasMode={canvasMode}
        onToggleView={() => setCanvasMode((v) => !v)}
      />
    </div>
  );
}

function StatusScreen({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">{text}</div>
    </div>
  );
}

function ChatPanel({
  messages,
  files,
  messagesEndRef,
}: {
  messages: ChatEntry[];
  files: ReceivedFile[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 && files.length === 0 && (
        <div className="text-muted-foreground text-sm text-center mt-8">
          No messages yet. Start typing below.
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              msg.from === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}
      {files.length > 0 && (
        <div className="pt-3 mt-3 border-t border-border space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Files</div>
          {files.map((file) => (
            <Button
              key={file.id}
              variant="ghost"
              className="w-full justify-start h-auto py-2 px-3"
              asChild
            >
              <a href={file.downloadUrl} download={file.filename}>
                <FileDown className="h-4 w-4 shrink-0" />
                <div className="text-left">
                  <div className="font-medium">{file.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {file.mime} - {Math.max(1, Math.round(file.size / 1024))} KB
                  </div>
                </div>
              </a>
            </Button>
          ))}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

function CanvasPanel({ html }: { html: string | null }) {
  if (!html) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Waiting for content...</p>
      </div>
    );
  }
  return (
    <iframe
      srcDoc={`<base target="_blank">${html}`}
      sandbox="allow-scripts allow-popups allow-forms"
      className="absolute inset-0 w-full h-full border-none"
      title="Canvas"
    />
  );
}

async function ensureChannelReady(
  bridge: BrowserBridge,
  channel: string,
  timeoutMs = 5000,
): Promise<boolean> {
  if (bridge.isChannelOpen(channel)) return true;
  const dc = bridge.openChannel(channel);
  if (!dc) return false;
  if (dc.readyState === "open") return true;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => done(false), timeoutMs);
    dc.addEventListener("open", () => done(true), { once: true });
    dc.addEventListener("close", () => done(false), { once: true });
  });
}
