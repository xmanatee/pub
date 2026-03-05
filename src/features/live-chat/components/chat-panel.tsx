import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  FileDown,
  ImageIcon,
  Paperclip,
} from "lucide-react";
import type { RefObject } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AudioBubble } from "~/features/live-chat/components/audio-bubble";
import type {
  AttachmentChatEntry,
  ChatEntry,
  ImageChatEntry,
  ReceivedFile,
  SystemChatEntry,
} from "~/features/live-chat/types/live-chat-types";

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
  if (delivery === "confirmed") return <CheckCheck className={base} />;
  return <AlertCircle className={`${base} text-destructive`} />;
}

function ImageBubble({ entry }: { entry: ImageChatEntry }) {
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

function ChatBubble({ msg }: { msg: ChatEntry }) {
  if (msg.type === "system") return <SystemBubble entry={msg} />;

  const isUser = msg.from === "user";
  const bubbleClass = isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground";

  const delivery = isUser ? (msg.delivery ?? "sending") : undefined;

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
        {msg.type === "image" && <ImageBubble entry={msg} />}
        {msg.type === "attachment" && <AttachmentBubble entry={msg} />}
        {delivery && (msg.type === "image" || msg.type === "attachment") && (
          <div className="flex justify-end mt-1">
            <DeliveryIcon delivery={delivery} />
          </div>
        )}
      </div>
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
        <ChatBubble key={msg.id} msg={msg} />
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
