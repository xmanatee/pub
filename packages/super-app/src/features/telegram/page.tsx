import { MessageCircle, Send } from "lucide-react";
import * as React from "react";
import type { TelegramAuthState, TelegramDialog, TelegramMessage } from "~/commands/results";
import { EmptyState } from "~/components/shell/empty-state";
import { ErrorState } from "~/components/shell/error-state";
import { PageHeader } from "~/components/shell/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { SkeletonList } from "~/components/ui/skeleton-list";
import { cn } from "~/lib/cn";
import { fmtTime } from "~/lib/fmt";
import { tryInvoke, useCommand } from "~/lib/pub";
import { AuthFlow } from "./auth-flow";

// Telegram timestamps are unix-seconds; helper converts and renders smart (time today, date older).
const fmt = (sec: number) => fmtTime(sec * 1000, true);

function Page({ children, description }: { children: React.ReactNode; description?: string }) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Messages" description={description} />
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </div>
  );
}

export function TelegramPage() {
  const auth = useCommand<TelegramAuthState>("telegram.auth.state");
  const [selected, setSelected] = React.useState<string | null>(null);

  if (auth.status === "loading" || auth.status === "idle") {
    return (
      <Page>
        <Skeleton className="h-full w-full" />
      </Page>
    );
  }
  if (auth.status === "error") {
    return (
      <Page>
        <ErrorState error={auth.error} onRetry={auth.reload} />
      </Page>
    );
  }
  if (auth.value.status !== "logged-in") {
    return (
      <Page description="Connect your Telegram account to read and send messages.">
        <AuthFlow auth={auth.value} onChange={auth.reload} />
      </Page>
    );
  }
  return <TelegramShell selected={selected} onSelect={setSelected} />;
}

function TelegramShell({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const dialogs = useCommand<{ dialogs: TelegramDialog[] }>("telegram.dialogs");
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Messages" onRefresh={dialogs.reload} />
      <div className="grid flex-1 min-h-0 grid-cols-[20rem_1fr] divide-x">
        <div className="flex min-h-0 flex-col">
          {dialogs.status === "loading" || dialogs.status === "idle" ? (
            <SkeletonList count={10} itemClassName="h-14" className="space-y-1 p-2" />
          ) : dialogs.status === "error" ? (
            <ErrorState error={dialogs.error} onRetry={dialogs.reload} />
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-0.5 p-2">
                {dialogs.value.dialogs.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => onSelect(d.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors",
                      selected === d.id ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{d.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {fmt(d.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                          {d.lastMessage ?? ""}
                        </span>
                        {d.unread > 0 ? (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                            {d.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        <div className="min-h-0">
          {selected ? (
            <Thread dialogId={selected} />
          ) : (
            <EmptyState
              icon={<MessageCircle className="size-6" />}
              title="Select a chat"
              description="Pick a conversation to start reading."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Thread({ dialogId }: { dialogId: string }) {
  const messages = useCommand<{ messages: TelegramMessage[] }>(
    "telegram.messages",
    { dialogId, limit: 50 },
    [dialogId],
  );
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setSending(true);
    if (await tryInvoke("telegram.send", { dialogId, text: t })) {
      setDraft("");
      messages.reload();
    }
    setSending(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0">
        {messages.status === "loading" || messages.status === "idle" ? (
          <SkeletonList count={6} itemClassName="h-12 w-2/3" className="p-4" />
        ) : messages.status === "error" ? (
          <ErrorState error={messages.error} onRetry={messages.reload} />
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col-reverse gap-2 p-4">
              {messages.value.messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                    m.out ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
                  )}
                >
                  {m.from && !m.out ? (
                    <div className="mb-0.5 text-[10px] font-medium opacity-70">{m.from}</div>
                  ) : null}
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className="mt-0.5 text-right text-[10px] opacity-60">{fmt(m.date)}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
      <form
        onSubmit={onSend}
        className="flex shrink-0 items-center gap-2 border-t bg-background p-3"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          autoFocus
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || sending}>
          <Send />
        </Button>
      </form>
    </div>
  );
}
