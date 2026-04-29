import {
  CalendarClock,
  FileUp,
  Info,
  Loader2,
  LogOut,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import * as React from "react";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { cn } from "~/core/cn";
import { fmtTime } from "~/core/fmt";
import { useConfirm } from "~/core/hooks/use-confirm";
import { usePrompt } from "~/core/hooks/use-prompt";
import { useTryToast } from "~/core/hooks/use-toast";
import { useIncomingTarget } from "~/core/navigation/use-target-navigation";
import { useAsync } from "~/core/pub";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import { Input } from "~/core/ui/input";
import { Skeleton } from "~/core/ui/skeleton";
import { AuthFlow } from "./auth-flow";
import { telegram } from "./client";
import type { TelegramDialog, TelegramMessage } from "./commands";
import { MessageRow } from "./message-row";
import { PeerInfoDrawer } from "./peer-info";

export function TelegramPage() {
  const tryToast = useTryToast();
  const confirm = useConfirm();
  const { state, reload } = useAsync(() => telegram.authState(), []);

  if (state.status === "loading") {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Telegram" />
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Telegram" />
        <div className="flex-1 p-6">
          <ErrorState error={state.error} onRetry={reload} />
        </div>
      </div>
    );
  }
  if (state.value.status !== "logged-in") {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Telegram" description="Sign in with your phone number" />
        <div className="flex flex-1 items-center justify-center p-6">
          <AuthFlow auth={state.value} onChange={reload} />
        </div>
      </div>
    );
  }

  const me = state.value.me;
  const description = me.username ? `@${me.username}` : (me.firstName ?? me.id);

  const onLogout = async () => {
    if (!(await confirm({ title: "Log out of Telegram?", danger: true }))) return;
    await tryToast(async () => {
      await telegram.logout();
      reload();
    });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Telegram"
        description={description}
        actions={
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="size-4" />
            <span className="ml-1">Log out</span>
          </Button>
        }
      />
      <Shell />
    </div>
  );
}

function Shell() {
  const tryToast = useTryToast();
  const [dialogLimit, setDialogLimit] = React.useState(50);
  const { state, reload } = useAsync(
    () => telegram.dialogs(dialogLimit).then((r) => r.dialogs),
    [dialogLimit],
  );
  const [active, setActive] = React.useState<string | null>(null);
  const [showInfo, setShowInfo] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [dialogFilter, setDialogFilter] = React.useState<
    "all" | "unread" | "users" | "groups" | "channels"
  >("all");
  const [digesting, setDigesting] = React.useState(false);
  const [digest, setDigest] = React.useState<string | null>(null);

  const dialogs = state.status === "loaded" ? state.value : null;
  const filtered = React.useMemo(() => {
    if (!dialogs) return [];
    const q = search.trim().toLowerCase();
    return dialogs
      .filter((d) => {
        if (dialogFilter === "unread") return d.unread > 0;
        if (dialogFilter === "users") return d.isUser;
        if (dialogFilter === "groups") return d.isGroup;
        if (dialogFilter === "channels") return d.isChannel;
        return true;
      })
      .filter((d) => !q || d.title.toLowerCase().includes(q));
  }, [dialogFilter, dialogs, search]);

  React.useEffect(() => {
    if (filtered.length > 0 && !active) setActive(filtered[0].id);
  }, [filtered, active]);

  const generateDigest = () =>
    tryToast(async () => {
      if (!dialogs) return;
      setDigesting(true);
      setDigest(null);
      try {
        const unread = dialogs.filter((d) => d.unread > 0).slice(0, 12);
        const text = await runAI<{ items: { priority: string; reason: string; id?: string }[] }>(
          prompts.digestThreads,
          {
            messages: JSON.stringify(
              unread.map((d) => ({
                id: d.id,
                title: d.title,
                lastMessage: d.lastMessage,
                unread: d.unread,
              })),
            ),
          },
        );
        setDigest(
          (text.items ?? [])
            .map(
              (i) =>
                `${i.priority === "needs-response" ? "🔴" : i.priority === "worth-reading" ? "🟡" : "🟢"} ${i.reason}`,
            )
            .join("\n"),
        );
      } finally {
        setDigesting(false);
      }
    });

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 min-h-0 shrink-0 flex-col border-r">
        <div className="shrink-0 space-y-2 border-b px-3 py-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="h-8"
          />
          <div className="flex gap-1 overflow-x-auto">
            {(["all", "unread", "users", "groups", "channels"] as const).map((f) => (
              <Button
                key={f}
                variant={dialogFilter === f ? "secondary" : "ghost"}
                size="sm"
                className="h-7 capitalize"
                onClick={() => setDialogFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generateDigest}
            disabled={digesting || !dialogs?.some((d) => d.unread > 0)}
            className="w-full justify-center"
          >
            {digesting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            Digest unread
          </Button>
          {digest ? (
            <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs leading-relaxed">
              {digest}
            </pre>
          ) : null}
        </div>
        {state.status === "error" ? (
          <div className="p-4">
            <ErrorState error={state.error} onRetry={reload} />
          </div>
        ) : state.status === "loading" ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 8 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No chats</div>
        ) : (
          <div className="flex-1 overflow-auto">
            {filtered.map((d) => (
              <DialogRow
                key={d.id}
                dialog={d}
                active={d.id === active}
                onSelect={() => {
                  setActive(d.id);
                  setShowInfo(false);
                }}
              />
            ))}
            {filtered.length >= dialogLimit ? (
              <div className="p-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setDialogLimit((n) => n + 50)}
                >
                  Load more chats
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </aside>
      {active ? (
        <Thread
          key={active}
          dialogId={active}
          dialog={dialogs?.find((d) => d.id === active) ?? null}
          showInfo={showInfo}
          onToggleInfo={() => setShowInfo((v) => !v)}
          onLeft={() => {
            setActive(null);
            setShowInfo(false);
            reload();
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Pick a chat
        </div>
      )}
    </div>
  );
}

function DialogRow({
  dialog: d,
  active,
  onSelect,
}: {
  dialog: TelegramDialog;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2 border-b px-3 py-2 text-left hover:bg-accent/50",
        active && "bg-accent",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium">{d.title}</div>
          <div className="telegram-metadata shrink-0 text-muted-foreground">
            {fmtTime(d.date * 1000, true)}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-xs text-muted-foreground">{d.lastMessage ?? " "}</div>
          {d.unread > 0 ? <Badge variant="default">{d.unread}</Badge> : null}
        </div>
      </div>
    </button>
  );
}

type Compose =
  | { kind: "new"; text: string }
  | { kind: "reply"; text: string; target: TelegramMessage }
  | { kind: "edit"; text: string; target: TelegramMessage };

function Thread({
  dialogId,
  dialog,
  showInfo,
  onToggleInfo,
  onLeft,
}: {
  dialogId: string;
  dialog: TelegramDialog | null;
  showInfo: boolean;
  onToggleInfo: () => void;
  onLeft: () => void;
}) {
  const promptUser = usePrompt();
  const tryToast = useTryToast();
  const [messageLimit, setMessageLimit] = React.useState(50);
  const { state, reload } = useAsync(
    () => telegram.messages(dialogId, messageLimit).then((r) => r.messages),
    [dialogId, messageLimit],
  );
  const [compose, setCompose] = React.useState<Compose>({ kind: "new", text: "" });
  const [messageSearch, setMessageSearch] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<TelegramMessage[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const incoming = useIncomingTarget("telegram");

  React.useEffect(() => {
    if (incoming.target) {
      setCompose({ kind: "new", text: incoming.target.context.excerpt });
      incoming.consume();
    }
  }, [incoming]);

  React.useEffect(() => {
    setCompose({ kind: "new", text: "" });
    setMessageLimit(50);
    setMessageSearch("");
    setSearchResults(null);
    setScheduledAt("");
    void telegram.markRead(dialogId).catch(() => {});
  }, [dialogId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compose.text.trim() || busy) return;
    setBusy(true);
    await tryToast(async () => {
      if (compose.kind === "edit") await telegram.edit(dialogId, compose.target.id, compose.text);
      else if (scheduledAt) {
        const delay = new Date(scheduledAt).getTime() - Date.now();
        const text = compose.text;
        const replyTo = compose.kind === "reply" ? compose.target.id : undefined;
        window.setTimeout(
          () => void telegram.send(dialogId, text, replyTo).catch(() => {}),
          Math.max(0, delay),
        );
      } else if (compose.kind === "reply")
        await telegram.send(dialogId, compose.text, compose.target.id);
      else await telegram.send(dialogId, compose.text);
      setCompose({ kind: "new", text: "" });
      setScheduledAt("");
      reload();
    });
    setBusy(false);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    await tryToast(async () => {
      const replyTo = compose.kind === "reply" ? compose.target.id : undefined;
      await telegram.sendFile(dialogId, file, compose.text, replyTo);
      setCompose({ kind: "new", text: "" });
      reload();
    });
  };

  const runSearch = async () => {
    const q = messageSearch.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    await tryToast(async () => {
      const result = await telegram.searchMessages(dialogId, q, 80);
      setSearchResults(result.messages);
    });
    setSearching(false);
  };

  const onForward = async (target: TelegramMessage) => {
    const to = await promptUser({ title: "Forward to dialog id", placeholder: "@username or id" });
    if (!to) return;
    await tryToast(() => telegram.forward(dialogId, to, [target.id]), {
      successTitle: "Forwarded",
    });
  };

  const messages = searchResults ?? (state.status === "loaded" ? state.value : []);
  const messageById = React.useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
          <div className="truncate text-sm font-medium">{dialog?.title ?? dialogId}</div>
          <div className="flex items-center gap-2">
            <form
              className="hidden items-center gap-1 md:flex"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
            >
              <Input
                value={messageSearch}
                onChange={(e) => {
                  setMessageSearch(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                placeholder="Search messages"
                className="h-8 w-48"
              />
              <Button type="submit" variant="ghost" size="icon" aria-label="Search messages">
                {searching ? <Loader2 className="animate-spin" /> : <Search />}
              </Button>
            </form>
            <Button variant="ghost" size="icon" onClick={onToggleInfo} aria-label="Chat info">
              <Info className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-auto p-4">
          {state.status === "error" ? (
            <ErrorState error={state.error} onRetry={reload} />
          ) : state.status === "loading" ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
                <Skeleton key={i} className={cn("h-10", i % 2 ? "ml-auto w-1/2" : "w-2/3")} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground">No messages</div>
          ) : (
            <div className="flex flex-col gap-1">
              {!searchResults && messages.length >= messageLimit ? (
                <Button variant="outline" size="sm" onClick={() => setMessageLimit((n) => n + 50)}>
                  Load older messages
                </Button>
              ) : null}
              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  dialogId={dialogId}
                  replyTarget={m.replyToId ? (messageById.get(m.replyToId) ?? null) : null}
                  onReply={(target) => setCompose({ kind: "reply", text: "", target })}
                  onEdit={(target) => setCompose({ kind: "edit", text: target.text, target })}
                  onForward={onForward}
                  onChanged={reload}
                  onAiReply={(text) => setCompose((c) => ({ ...c, text }))}
                />
              ))}
            </div>
          )}
        </div>
        {compose.kind !== "new" ? (
          <div className="flex shrink-0 items-center gap-2 border-t bg-muted/30 px-4 py-1.5 text-xs">
            <span className="font-medium">
              {compose.kind === "edit" ? "Editing" : "Replying to"}
            </span>
            <span className="min-w-0 flex-1 truncate opacity-70">
              {compose.target.text || compose.target.mediaType || "message"}
            </span>
            <button
              type="button"
              onClick={() => setCompose({ kind: "new", text: "" })}
              aria-label="Cancel"
            >
              <X className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border hover:bg-accent">
            <FileUp className="size-4" />
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0] ?? null;
                e.currentTarget.value = "";
                void onFile(file);
              }}
            />
          </label>
          <Input
            value={compose.text}
            onChange={(e) => setCompose((c) => ({ ...c, text: e.target.value }))}
            placeholder={compose.kind === "edit" ? "Edit message" : "Write a message"}
            autoFocus
          />
          <ScheduleInput value={scheduledAt} onChange={setScheduledAt} />
          <Button type="submit" disabled={!compose.text.trim() || busy}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
      {showInfo ? (
        <PeerInfoDrawer dialogId={dialogId} onClose={onToggleInfo} onLeft={onLeft} />
      ) : null}
    </div>
  );
}

function ScheduleInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border hover:bg-accent">
      <CalendarClock className={cn("size-4", value && "text-primary")} />
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Schedule message"
      />
    </label>
  );
}
