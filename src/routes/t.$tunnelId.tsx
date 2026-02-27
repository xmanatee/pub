import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { FileDown, Paperclip, Send } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  CHANNELS,
  makeBinaryMetaMessage,
  makeHtmlMessage,
  makeTextMessage,
} from "~/lib/bridge-protocol";
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
    const onOpen = () => done(true);
    const onClose = () => done(false);
    const timeout = setTimeout(() => done(false), timeoutMs);
    dc.addEventListener("open", onOpen, { once: true });
    dc.addEventListener("close", onClose, { once: true });
  });
}

function TunnelPage() {
  const { tunnelId } = Route.useParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({ to: "/login" });
    }
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
  const [canvasTitle, setCanvasTitle] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const lastAgentCandidateCount = useRef(0);
  const lastHandledOffer = useRef<string | null>(null);
  const localIceFlushInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileUrlsRef = useRef<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addMessageWithScroll = useCallback((entry: ChatEntry) => {
    setMessages((prev) => {
      const next = [...prev, entry];
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const url of fileUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      fileUrlsRef.current = [];
    };
  }, []);

  const handleBridgeMessage = useCallback(
    (cm: ChannelMessage) => {
      const { channel, message } = cm;
      if (channel === CHANNELS.CHAT && message.type === "text" && message.data) {
        addMessageWithScroll({
          id: message.id,
          from: "agent",
          content: message.data,
          timestamp: Date.now(),
        });
      } else if (channel === CHANNELS.CANVAS) {
        if (message.type === "html" && message.data) {
          setCanvasHtml(message.data);
          setCanvasTitle(message.meta?.title as string | undefined);
        } else if (message.type === "event" && message.data === "hide") {
          setCanvasHtml(null);
        }
      } else if (channel === CHANNELS.FILE && message.type === "binary" && cm.binaryData) {
        const binaryData = cm.binaryData;
        const filename =
          typeof message.meta?.filename === "string" ? message.meta.filename : "download.bin";
        const mime =
          typeof message.meta?.mime === "string" ? message.meta.mime : "application/octet-stream";
        const blob = new Blob([binaryData], { type: mime });
        const downloadUrl = URL.createObjectURL(blob);
        fileUrlsRef.current.push(downloadUrl);
        setFiles((prev) => [
          ...prev,
          {
            id: message.id,
            filename,
            mime,
            size: binaryData.byteLength,
            downloadUrl,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [addMessageWithScroll],
  );

  // Initialize bridge once tunnel data is available
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
        if (candidates.length > 0) {
          await storeBrowserSignal({ tunnelId, candidates });
        }

        if (localIceFlushInterval.current) {
          clearInterval(localIceFlushInterval.current);
        }
        localIceFlushInterval.current = setInterval(() => {
          void (async () => {
            try {
              const current = bridge.getIceCandidates();
              if (current.length > candidates.length) {
                const newCandidates = current.slice(candidates.length);
                candidates.push(...newCandidates);
                await storeBrowserSignal({ tunnelId, candidates: newCandidates });
              }
            } catch {
              // Retry on next interval while signaling is active.
            }
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

  // Add agent ICE candidates as they arrive via Convex reactive query
  useEffect(() => {
    if (!tunnel?.agentCandidates || !bridgeRef.current) return;
    const newCandidates = tunnel.agentCandidates.slice(lastAgentCandidateCount.current);
    if (newCandidates.length > 0) {
      lastAgentCandidateCount.current = tunnel.agentCandidates.length;
      void bridgeRef.current.addRemoteCandidates(newCandidates);
    }
  }, [tunnel?.agentCandidates]);

  const sendChat = useCallback(() => {
    if (!input.trim() || !bridgeRef.current) return;
    const bridge = bridgeRef.current;
    const content = input.trim();
    void (async () => {
      const ready = await ensureChannelReady(bridge, CHANNELS.CHAT);
      if (!ready) return;
      const msg = makeTextMessage(content);
      const sent = bridge.send(CHANNELS.CHAT, msg);
      if (!sent) return;
      addMessageWithScroll({
        id: msg.id,
        from: "user",
        content,
        timestamp: Date.now(),
      });
      setInput("");
    })();
  }, [input, addMessageWithScroll]);

  if (tunnel === undefined) {
    return <StatusScreen text="Loading..." />;
  }

  if (tunnel === null) {
    return <StatusScreen text="Tunnel not found or expired." />;
  }

  if (!tunnel.agentOffer) {
    return <StatusScreen text="Waiting for agent to connect..." />;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground">
      <TunnelHeader tunnelId={tunnelId} title={tunnel.title} state={bridgeState} />
      <div className="flex flex-1 min-h-0">
        <div className={`flex flex-col ${canvasHtml ? "w-1/2 border-r border-border" : "w-full"}`}>
          <ChatPanel messages={messages} files={files} messagesEndRef={messagesEndRef} />
          <ChatInput
            input={input}
            setInput={setInput}
            onSend={sendChat}
            disabled={bridgeState !== "connected"}
            bridge={bridgeRef.current}
          />
        </div>
        {canvasHtml && <CanvasPanel html={canvasHtml} title={canvasTitle} />}
      </div>
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

function TunnelHeader({
  tunnelId,
  title,
  state,
}: {
  tunnelId: string;
  title?: string;
  state: BridgeState;
}) {
  const badgeProps: Record<
    BridgeState,
    { variant: "outline" | "destructive" | "secondary"; className: string }
  > = {
    connecting: { variant: "outline", className: "gap-1.5 text-yellow-600 border-yellow-600/20" },
    connected: { variant: "outline", className: "gap-1.5 text-green-600 border-green-600/20" },
    disconnected: { variant: "destructive", className: "gap-1.5" },
    closed: { variant: "secondary", className: "gap-1.5" },
  };

  const dotColors: Record<BridgeState, string> = {
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    disconnected: "bg-destructive-foreground",
    closed: "bg-secondary-foreground/50",
  };

  const { variant, className } = badgeProps[state];

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
      <span className="text-sm font-medium">{title || tunnelId}</span>
      <Badge variant={variant} className={`ml-auto ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[state]}`} />
        {state}
      </Badge>
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
    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
      {messages.length === 0 && (
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
                <FileDown className="h-4 w-4 shrink-0" aria-hidden="true" />
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

function ChatInput({
  input,
  setInput,
  onSend,
  disabled,
  bridge,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  bridge: BrowserBridge | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !bridge) return;
      const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
      if (isHtml) {
        const text = await file.text();
        const ready = await ensureChannelReady(bridge, CHANNELS.CANVAS);
        if (!ready) return;
        const sent = bridge.send(CHANNELS.CANVAS, makeHtmlMessage(text, file.name));
        if (!sent) return;
      } else {
        const binary = await file.arrayBuffer();
        const ready = await ensureChannelReady(bridge, CHANNELS.FILE);
        if (!ready) return;
        const metaSent = bridge.send(
          CHANNELS.FILE,
          makeBinaryMetaMessage({
            filename: file.name,
            mime: file.type || "application/octet-stream",
            size: binary.byteLength,
          }),
        );
        if (!metaSent) return;
        const payloadSent = bridge.sendBinary(CHANNELS.FILE, binary);
        if (!payloadSent) return;
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [bridge],
  );

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/20 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach file"
      >
        <Paperclip className="h-4 w-4" aria-hidden="true" />
      </Button>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
      <Input
        className="flex-1"
        placeholder={disabled ? "Connecting..." : "Type a message..."}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
          e.key === "Enter" && !e.shiftKey && onSend()
        }
        disabled={disabled}
      />
      <Button onClick={onSend} disabled={disabled || !input.trim()} size="sm">
        <Send className="h-4 w-4 mr-1" aria-hidden="true" />
        Send
      </Button>
    </div>
  );
}

function CanvasPanel({ html, title }: { html: string; title?: string }) {
  const srcDoc = `<base target="_blank">${html}`;
  return (
    <div className="w-1/2 flex flex-col min-h-0">
      {title && (
        <div className="px-4 py-2 border-b border-border text-sm font-medium bg-muted/30 shrink-0">
          {title}
        </div>
      )}
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups allow-forms"
        className="flex-1 w-full border-none"
        title={title || "Canvas"}
      />
    </div>
  );
}
