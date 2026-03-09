import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  Check,
  CheckCheck,
  Clock,
  FileDown,
  ImageIcon,
  Paperclip,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AudioBubble } from "~/features/live-chat/components/audio-bubble";
import type {
  AttachmentChatEntry,
  ChatDeliveryState,
  ChatEntry,
  ImageChatEntry,
  SystemChatEntry,
} from "~/features/live-chat/types/live-chat-types";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";

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
const JUMP_MIN_DISTANCE_PX = 96;
const JUMP_FAR_DISTANCE_PX = 240;
const ESTIMATED_MESSAGE_HEIGHT_PX = 56;
const MIN_HIDDEN_MESSAGES = 2;

function shouldShowJumpToLatest(distanceFromBottom: number): boolean {
  if (distanceFromBottom <= JUMP_MIN_DISTANCE_PX) return false;
  if (distanceFromBottom >= JUMP_FAR_DISTANCE_PX) return true;
  const hiddenMessages = Math.floor(distanceFromBottom / ESTIMATED_MESSAGE_HEIGHT_PX);
  return hiddenMessages >= MIN_HIDDEN_MESSAGES;
}

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

function SystemBubble({ entry }: { entry: SystemChatEntry }) {
  const isError = entry.severity === "error";
  return (
    <div className="flex justify-center">
      <div
        className={
          isError
            ? "flex max-w-full items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            : "flex max-w-full items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
        }
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-medium">{isError ? "Error" : "Warning"}:</span> {entry.content}
        </span>
      </div>
    </div>
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
  if (msg.type === "system") return <SystemBubble entry={msg} />;

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

export function ChatPanel() {
  const { files, messages, messagesEndRef } = useLiveSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messageCount = messages.length;
  const fileCount = files.length;

  const getDistanceFromBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return 0;
    return Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
  }, []);

  const isNearBottom = useCallback(
    () => getDistanceFromBottom() <= NEAR_BOTTOM_PX,
    [getDistanceFromBottom],
  );

  const shouldShowJump = useCallback(
    () => shouldShowJumpToLatest(getDistanceFromBottom()),
    [getDistanceFromBottom],
  );

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
      setShowJumpToLatest(shouldShowJump());
    };

    onScroll();
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [shouldShowJump]);

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
    setShowJumpToLatest(shouldShowJump());
  }, [fileCount, isNearBottom, messageCount, scrollToLatest, shouldShowJump]);

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
        <div className="pointer-events-none absolute right-4 bottom-30 z-20">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-events-auto gap-1 rounded-full border-border/70 bg-background/88 shadow-lg backdrop-blur-xl hover:bg-background/95"
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
