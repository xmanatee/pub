import { Archive, Loader2, Mail as MailIcon, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { AIActionPanel } from "~/core/ai/action-panel";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { useConfirm } from "~/core/hooks/use-confirm";
import { useTryToast } from "~/core/hooks/use-toast";
import { useIncomingTarget } from "~/core/navigation/use-target-navigation";
import { useAsync } from "~/core/pub";
import { ListDetail, type ListDetailItemsState } from "~/core/shell/list-detail";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Skeleton } from "~/core/ui/skeleton";
import { Textarea } from "~/core/ui/textarea";
import { mailApi } from "./client";
import type { MailMessage } from "./commands";

const QUERY_PRESETS = [
  { label: "Inbox", q: "in:inbox" },
  { label: "Unread", q: "in:inbox is:unread" },
  { label: "Starred", q: "is:starred" },
  { label: "Sent", q: "in:sent" },
];

export function MailPage() {
  const tryToast = useTryToast();
  const confirm = useConfirm();
  const [query, setQuery] = React.useState("in:inbox");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [composeDraft, setComposeDraft] = React.useState({ to: "", subject: "", body: "" });

  const incoming = useIncomingTarget("mail");
  React.useEffect(() => {
    if (!incoming.target) return;
    setComposeOpen(true);
    const fields = incoming.target.context.fields ?? {};
    void runAI<{ to: string; subject: string; body: string }>(prompts.composeEmail, {
      context: incoming.target.context.excerpt,
    })
      .then((draft) =>
        setComposeDraft({
          to: draft.to ?? fields.to ?? "",
          subject: draft.subject,
          body: draft.body,
        }),
      )
      .catch((err) => tryToast(() => Promise.reject(err), { errorTitle: "Couldn't draft" }));
    incoming.consume();
  }, [incoming, tryToast]);

  const { state, reload } = useAsync(() => mailApi.list(query).then((r) => r.messages), [query]);

  const onArchive = async (id: string) => {
    await tryToast(() => mailApi.archive(id), { successTitle: "Archived" });
    if (selectedId === id) setSelectedId(null);
    reload();
  };

  const onTrash = async (id: string) => {
    if (!(await confirm({ title: "Move to trash?", danger: true }))) return;
    await tryToast(() => mailApi.trash(id), { successTitle: "Trashed" });
    if (selectedId === id) setSelectedId(null);
    reload();
  };

  const itemsState: ListDetailItemsState<MailMessage> = React.useMemo(() => {
    if (state.status === "loading") return { status: "loading" };
    if (state.status === "error") return { status: "error", error: state.error };
    return { status: "loaded", items: state.value };
  }, [state]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Mail"
        description={`Query: ${query}`}
        onRefresh={reload}
        actions={
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Send className="size-3.5" /> Compose
          </Button>
        }
      />
      <div className="flex shrink-0 items-center gap-1.5 border-b px-6 py-2">
        {QUERY_PRESETS.map((preset) => (
          <Button
            key={preset.q}
            variant={preset.q === query ? "default" : "outline"}
            size="sm"
            onClick={() => setQuery(preset.q)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ListDetail
          state={itemsState}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            void mailApi.markRead(id).catch(() => {});
          }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Filter inbox…"
          filter={(m, q) =>
            m.from.toLowerCase().includes(q) ||
            m.subject.toLowerCase().includes(q) ||
            m.snippet.toLowerCase().includes(q)
          }
          onRetry={reload}
          emptyTitle="No mail"
          emptyDescription="Nothing matches this query."
          renderRow={(m) => <Row message={m} />}
          renderDetail={(m) => (
            <MessageDetail
              message={m}
              onArchive={() => onArchive(m.id)}
              onTrash={() => onTrash(m.id)}
            />
          )}
        />
      </div>
      <ComposeDialog
        open={composeOpen}
        draft={composeDraft}
        onChange={setComposeDraft}
        onClose={() => setComposeOpen(false)}
        onSend={async () => {
          await tryToast(
            () => mailApi.send(composeDraft.to, composeDraft.subject, composeDraft.body),
            { successTitle: "Sent" },
          );
          setComposeOpen(false);
          setComposeDraft({ to: "", subject: "", body: "" });
        }}
        onSaveDraft={async () => {
          await tryToast(
            () => mailApi.draft(composeDraft.to, composeDraft.subject, composeDraft.body),
            { successTitle: "Draft saved" },
          );
          setComposeOpen(false);
        }}
      />
    </div>
  );
}

function Row({ message: m }: { message: MailMessage }) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline gap-2">
        <div className={`flex-1 truncate text-sm ${m.unread ? "font-semibold" : ""}`}>{m.from}</div>
        <div className="shrink-0 text-xs text-muted-foreground">{m.date}</div>
      </div>
      <div className={`mt-0.5 truncate text-sm ${m.unread ? "" : "text-muted-foreground"}`}>
        {m.subject}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.snippet}</div>
    </div>
  );
}

function MessageDetail({
  message,
  onArchive,
  onTrash,
}: {
  message: MailMessage;
  onArchive: () => void;
  onTrash: () => void;
}) {
  const detail = useAsync(() => mailApi.read(message.id), [message.id]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-tight">{message.subject}</h2>
          <div className="text-xs text-muted-foreground">
            {message.from} → {message.to ?? "you"} · {message.date}
          </div>
          <div className="flex flex-wrap gap-1">
            {message.labels.slice(0, 6).map((label) => (
              <Badge key={label} variant="outline" className="text-[10px]">
                {label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onArchive}>
            <Archive className="size-3.5" /> Archive
          </Button>
          <Button variant="outline" size="sm" onClick={onTrash}>
            <Trash2 className="size-3.5" /> Trash
          </Button>
        </div>
        <div className="rounded-md border bg-card p-4 text-sm">
          {detail.state.status === "loading" ? (
            <Skeleton className="h-32 w-full" />
          ) : detail.state.status === "error" ? (
            <p className="text-xs text-destructive">{detail.state.error}</p>
          ) : detail.state.value.bodyHtml ? (
            <div
              className="prose-reader"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized in mail/server.ts via core/sanitize
              dangerouslySetInnerHTML={{ __html: detail.state.value.bodyHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans">
              {detail.state.value.body}
            </pre>
          )}
        </div>
        <AIActionPanel
          sourceServiceId="mail"
          sourceItemId={message.id}
          text={`From: ${message.from}\nSubject: ${message.subject}\n\n${
            detail.state.status === "loaded" ? detail.state.value.body : message.snippet
          }`}
          fields={{ to: message.from }}
          allow={["draft-email", "create-event", "create-task", "create-note"]}
        />
      </div>
    </ScrollArea>
  );
}

function ComposeDialog({
  open,
  draft,
  onChange,
  onClose,
  onSend,
  onSaveDraft,
}: {
  open: boolean;
  draft: { to: string; subject: string; body: string };
  onChange: (d: { to: string; subject: string; body: string }) => void;
  onClose: () => void;
  onSend: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ComposeShell open={open} onClose={onClose}>
      <div className="space-y-3">
        <Input
          placeholder="To"
          value={draft.to}
          onChange={(e) => onChange({ ...draft, to: e.target.value })}
        />
        <Input
          placeholder="Subject"
          value={draft.subject}
          onChange={(e) => onChange({ ...draft, subject: e.target.value })}
        />
        <Textarea
          rows={10}
          placeholder="Body"
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => wrap(onSaveDraft)} disabled={busy}>
            Save draft
          </Button>
          <Button onClick={() => wrap(onSend)} disabled={busy || !draft.to || !draft.subject}>
            {busy ? <Loader2 className="animate-spin" /> : <Send className="size-3.5" />} Send
          </Button>
        </div>
      </div>
    </ComposeShell>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/core/ui/dialog";

function ComposeShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <MailIcon className="size-4 text-primary" />
              New message
            </span>
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
