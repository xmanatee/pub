import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCheck,
  Clock,
  FileDown,
  ImageIcon,
  Paperclip,
} from "lucide-react";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AudioBubble } from "~/features/live-chat/components/audio-bubble";
import type {
  AttachmentChatEntry,
  ChatDeliveryState,
  ChatEntry,
  ImageChatEntry,
  ReceivedFile,
} from "~/features/live-chat/types/live-chat-types";

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const NEAR_BOTTOM_PX = 72;

function deliveryLabel(delivery: ChatDeliveryState): string {
  if (delivery === "sending") return "Sending";
  if (delivery === "sent") return "Sent";
  if (delivery === "received") return "Received";
  if (delivery === "confirmed") return "Confirmed";
  return "Failed";
}

function DeliveryIcon({ delivery }: { delivery: ChatDeliveryState }) {
  const base = "size-3";
  const label = deliveryLabel(delivery);

  let icon: ReactNode;
  if (delivery === "sending") icon = <Clock className={`${base} opacity-70`} aria-hidden />;
  else if (delivery === "sent") icon = <Check className={`${base} opacity-70`} aria-hidden />;
  else if (delivery === "received")
    icon = <CheckCheck className={`${base} opacity-70`} aria-hidden />;
  else if (delivery === "confirmed") icon = <CheckCheck className={base} aria-hidden />;
  else icon = <AlertCircle className={`${base} text-destructive`} aria-hidden />;

  return (
    <span className="inline-flex items-center" role="img" aria-label={label} title={label}>
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ImageBubble({ entry }: { entry: ImageChatEntry }) {
  return (
    <div className="space-y-1">
      <img
        src={entry.imageUrl}
        alt="Attachment preview"
        className="max-h-64 max-w-full rounded"
        width={entry.width}
        height={entry.height}
      />
      <div className="flex items-center gap-1 text-xs opacity-70">
        <ImageIcon className="size-3" />
        <span>{entry.mime}</span>
      </div>
    </div>
  );
}

function AttachmentBubble({ entry }: { entry: AttachmentChatEntry }) {
  const content = (
    <>
      <Paperclip className="size-4 shrink-0" />
      <div className="min-w-0">
        <div className="truncate text-sm">{entry.filename}</div>
        <div className="text-xs opacity-70">
          {entry.mime} - {Math.max(1, Math.round(entry.size / 1024))} KB
        </div>
      </div>
    </>
  );

  if (!entry.fileUrl) {
    return <div className="flex items-center gap-2">{content}</div>;
  }

  return (
    <a href={entry.fileUrl} download={entry.filename} className="flex items-center gap-2">
      {content}
    </a>
  );
}

function formatTimestamp(timestamp: number): string {
  return TIME_FORMATTER.format(new Date(timestamp));
}

function getDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.round((startToday - start) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return DATE_FORMATTER.format(date);
}

function ChatBubble({ msg }: { msg: ChatEntry }) {
  const isUser = msg.from === "user";
  const bubbleClass = isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground";
  const delivery = msg.from === "user" ? msg.delivery : null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-4/5 rounded-lg px-3 py-2 text-sm ${bubbleClass}`}>
        {msg.type === "text" && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
        {msg.type === "audio" && <AudioBubble entry={msg} />}
        {msg.type === "image" && <ImageBubble entry={msg} />}
        {msg.type === "attachment" && <AttachmentBubble entry={msg} />}

        <div
          className={`mt-1 flex items-center gap-1 text-[11px] ${
            isUser ? "justify-end text-primary-foreground/80" : "justify-start text-foreground/60"
          }`}
        >
          <span>{formatTimestamp(msg.timestamp)}</span>
          {delivery ? <DeliveryIcon delivery={delivery} /> : null}
        </div>
      </div>
    </div>
  );
}

function DayDivider({ timestamp }: { timestamp: number }) {
  return (
    <div className="flex justify-center py-1" data-testid="chat-day-divider">
      <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
        {formatDayLabel(timestamp)}
      </span>
    </div>
  );
}

export function ChatPanel({
  files,
  messages,
  messagesEndRef,
}: {
  files: ReceivedFile[];
  messages: ChatEntry[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messageCount = messages.length;
  const fileCount = files.length;

  const isNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance <= NEAR_BOTTOM_PX;
  }, []);

  const scrollToLatest = useCallback(
    (behavior: ScrollBehavior) => {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior });
      });
    },
    [messagesEndRef],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      setShowJumpToLatest(!isNearBottom());
    };

    onScroll();
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [isNearBottom]);

  useEffect(() => {
    if (messageCount === 0 && fileCount === 0) {
      setShowJumpToLatest(false);
      return;
    }
    if (isNearBottom()) {
      scrollToLatest("smooth");
      setShowJumpToLatest(false);
      return;
    }
    setShowJumpToLatest(true);
  }, [fileCount, isNearBottom, messageCount, scrollToLatest]);

  const rows: ReactNode[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const current = messages[i];
    const previous = i > 0 ? messages[i - 1] : null;
    if (!previous || getDayKey(previous.timestamp) !== getDayKey(current.timestamp)) {
      rows.push(<DayDivider key={`day-${current.id}`} timestamp={current.timestamp} />);
    }
    rows.push(<ChatBubble key={current.id} msg={current} />);
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-y-auto p-4 pb-36 space-y-3"
      style={{ paddingTop: "calc(var(--safe-top) + 1rem)" }}
    >
      {messages.length === 0 && files.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-muted-foreground text-sm text-center">
            No messages yet. Start typing in the control bar.
          </CardContent>
        </Card>
      )}

      {rows}

      {files.length > 0 && (
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Files
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2 space-y-2">
            {files.map((file) => (
              <Button
                key={file.id}
                variant="ghost"
                className="w-full justify-start h-auto py-2 px-3"
                asChild
              >
                <a href={file.downloadUrl} download={file.filename}>
                  <FileDown className="h-5 w-5 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">{file.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {file.mime} - {Math.max(1, Math.round(file.size / 1024))} KB
                    </div>
                  </div>
                </a>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {showJumpToLatest ? (
        <div className="sticky bottom-30 z-10 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1 rounded-full shadow"
            onClick={() => {
              scrollToLatest("smooth");
              setShowJumpToLatest(false);
            }}
            aria-label="Jump to latest message"
          >
            <ArrowDown className="size-4" />
            Latest
          </Button>
        </div>
      ) : null}

      <div ref={messagesEndRef} />
    </div>
  );
}
