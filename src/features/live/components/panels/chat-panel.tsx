import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  FileDown,
  ImageIcon,
  Paperclip,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AudioBubble } from "~/features/live/components/audio/audio-bubble";
import type {
  AttachmentChatEntry,
  ChatEntry,
  ImageChatEntry,
  ReceivedFile,
} from "~/features/live/types/live-types";

function DeliveryIcon({
  delivery,
  className = "",
}: {
  delivery: NonNullable<ChatEntry["delivery"]>;
  className?: string;
}) {
  const base = `size-3 ${className}`;
  if (delivery === "sending") return <Clock className={`${base} opacity-70`} />;
  if (delivery === "sent") return <Check className={`${base} opacity-70`} />;
  if (delivery === "received") return <CheckCheck className={`${base} opacity-70`} />;
  if (delivery === "confirmed") return <CheckCheck className={`${base} text-primary`} />;
  return <AlertCircle className={`${base} text-destructive`} />;
}

function ImageBubble({ entry, suffix }: { entry: ImageChatEntry; suffix?: ReactNode }) {
  return (
    <div className="space-y-1">
      <img
        src={entry.imageUrl}
        alt="Received attachment"
        className="max-h-64 max-w-full rounded"
        width={entry.width}
        height={entry.height}
      />
      <div className="flex items-center gap-1 text-xs opacity-70">
        <ImageIcon className="size-3" />
        <span>{entry.mime}</span>
        {suffix}
      </div>
    </div>
  );
}

function AttachmentBubble({ entry, suffix }: { entry: AttachmentChatEntry; suffix?: ReactNode }) {
  const content = (
    <>
      <Paperclip className="size-4 shrink-0" />
      <div className="min-w-0">
        <div className="truncate text-sm">{entry.filename}</div>
        <div className="text-xs opacity-70">
          {entry.mime} - {Math.max(1, Math.round(entry.size / 1024))} KB
        </div>
      </div>
      {suffix}
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

function ChatBubble({ msg, showDeliveryStatus }: { msg: ChatEntry; showDeliveryStatus: boolean }) {
  const isUser = msg.from === "user";
  const bubbleClass = isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground";

  const delivery = showDeliveryStatus && isUser ? msg.delivery : undefined;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-4/5 rounded-lg px-3 py-2 text-sm ${bubbleClass}`}>
        {msg.type === "text" && (
          <span>
            {msg.content}
            {delivery && (
              <DeliveryIcon delivery={delivery} className="ml-1 inline-block align-text-bottom" />
            )}
          </span>
        )}
        {msg.type === "audio" && (
          <div className="flex items-end gap-1">
            <div className="min-w-0 flex-1">
              <AudioBubble entry={msg} />
            </div>
            {delivery && <DeliveryIcon delivery={delivery} />}
          </div>
        )}
        {msg.type === "image" && (
          <ImageBubble entry={msg} suffix={delivery && <DeliveryIcon delivery={delivery} />} />
        )}
        {msg.type === "attachment" && (
          <AttachmentBubble entry={msg} suffix={delivery && <DeliveryIcon delivery={delivery} />} />
        )}
      </div>
    </div>
  );
}

export function ChatPanel({
  files,
  messages,
  messagesEndRef,
  showDeliveryStatus,
}: {
  files: ReceivedFile[];
  messages: ChatEntry[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  showDeliveryStatus: boolean;
}) {
  return (
    <div
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

      {messages.map((msg) => (
        <ChatBubble key={msg.id} msg={msg} showDeliveryStatus={showDeliveryStatus} />
      ))}

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

      <div ref={messagesEndRef} />
    </div>
  );
}
