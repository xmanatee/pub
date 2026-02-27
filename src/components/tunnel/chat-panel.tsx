import { FileDown } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { ChatEntry, ReceivedFile } from "./types";

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
    <div className="absolute inset-0 overflow-y-auto p-4 pb-36 space-y-3">
      {messages.length === 0 && files.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-muted-foreground text-sm text-center">
            No messages yet. Start typing in the control bar.
          </CardContent>
        </Card>
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
            <div>{msg.content}</div>
            {showDeliveryStatus && msg.from === "user" && msg.delivery && (
              <div className="mt-1 text-[10px] leading-none text-primary-foreground/70">
                {msg.delivery === "sending"
                  ? "Sending..."
                  : msg.delivery === "delivered"
                    ? "Delivered"
                    : "Not delivered"}
              </div>
            )}
          </div>
        </div>
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
          </CardContent>
        </Card>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
