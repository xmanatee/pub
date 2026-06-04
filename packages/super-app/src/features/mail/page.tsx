import {
  Archive,
  FileText,
  Keyboard,
  Loader2,
  Mail as MailIcon,
  Send,
  Star,
  Trash2,
} from "lucide-react";
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
import { Card, CardContent } from "~/core/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/core/ui/dialog";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Skeleton } from "~/core/ui/skeleton";
import { Textarea } from "~/core/ui/textarea";
import { parseComposeEmailDraft } from "./ai-results";
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
  const [triageMode, setTriageMode] = React.useState(false);
  const [docSource, setDocSource] = React.useState<{ subject: string; text: string } | null>(null);
  const [composeDraft, setComposeDraft] = React.useState({ to: "", subject: "", body: "" });

  const incoming = useIncomingTarget("mail");
  React.useEffect(() => {
    if (!incoming.target) return;
    setComposeOpen(true);
    const fields = incoming.target.context.fields ?? {};
    void runAI(
      prompts.composeEmail,
      {
        context: incoming.target.context.excerpt,
      },
      parseComposeEmailDraft,
    )
      .then((draft) => {
        const fieldTo = typeof fields.to === "string" ? fields.to : "";
        setComposeDraft({
          to: draft.to.length > 0 ? draft.to : fieldTo,
          subject: draft.subject,
          body: draft.body,
        });
      })
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

  const onMarkRead = async (id: string) => {
    await tryToast(() => mailApi.markRead(id), { successTitle: "Marked read" });
    reload();
  };

  const onStar = async (id: string) => {
    await tryToast(() => mailApi.star(id), { successTitle: "Starred" });
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
          <>
            <Button
              variant={triageMode ? "default" : "outline"}
              size="sm"
              onClick={() => setTriageMode((v) => !v)}
            >
              <Keyboard className="size-3.5" /> Triage
            </Button>
            <Button size="sm" onClick={() => setComposeOpen(true)}>
              <Send className="size-3.5" /> Compose
            </Button>
          </>
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
        {triageMode ? (
          <TriageView
            messages={state.status === "loaded" ? state.value : []}
            loading={state.status === "loading"}
            error={state.status === "error" ? state.error : null}
            onArchive={onArchive}
            onMarkRead={onMarkRead}
            onStar={onStar}
            onOpen={(id) => {
              setTriageMode(false);
              setSelectedId(id);
            }}
            onRetry={reload}
          />
        ) : (
          <ListDetail
            state={itemsState}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              void tryToast(() => mailApi.markRead(id), {
                errorTitle: "Couldn't mark message read",
              });
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
                onStar={() => onStar(m.id)}
                onDocument={(text) => setDocSource({ subject: m.subject, text })}
              />
            )}
          />
        )}
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
      <DocumentDialog source={docSource} onClose={() => setDocSource(null)} />
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
  onStar,
  onDocument,
}: {
  message: MailMessage;
  onArchive: () => void;
  onTrash: () => void;
  onStar: () => void;
  onDocument: (text: string) => void;
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
              <Badge key={label} variant="outline" className="text-tiny">
                {label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onArchive}>
            <Archive className="size-3.5" /> Archive
          </Button>
          <Button variant="outline" size="sm" onClick={onStar}>
            <Star className="size-3.5" /> Star
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onDocument(
                detail.state.status === "loaded"
                  ? detail.state.value.body || detail.state.value.snippet
                  : message.snippet,
              )
            }
          >
            <FileText className="size-3.5" /> To doc
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

function TriageView({
  messages,
  loading,
  error,
  onArchive,
  onMarkRead,
  onStar,
  onOpen,
  onRetry,
}: {
  messages: MailMessage[];
  loading: boolean;
  error: string | null;
  onArchive: (id: string) => Promise<void>;
  onMarkRead: (id: string) => Promise<void>;
  onStar: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  const [idx, setIdx] = React.useState(0);
  const current = messages[idx] ?? null;

  React.useEffect(() => {
    setIdx((i) => Math.min(i, Math.max(0, messages.length - 1)));
  }, [messages.length]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(messages.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (current && e.key === "a") {
        e.preventDefault();
        void onArchive(current.id);
      } else if (current && e.key === "r") {
        e.preventDefault();
        void onMarkRead(current.id);
      } else if (current && e.key === "s") {
        e.preventDefault();
        void onStar(current.id);
      } else if (current && e.key === "Enter") {
        e.preventDefault();
        onOpen(current.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, messages.length, onArchive, onMarkRead, onOpen, onStar]);

  if (loading) return <Skeleton className="m-6 h-48" />;
  if (error) {
    return (
      <div className="p-6">
        <p className="mb-2 text-sm text-destructive">{error}</p>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Keyboard:</span> j/k move · a archive · r
          mark read · s star · Enter open
        </div>
        {messages.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No messages to triage.
            </CardContent>
          </Card>
        ) : (
          messages.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIdx(i)}
              onDoubleClick={() => onOpen(m.id)}
              className={`block w-full rounded-md border bg-card p-4 text-left transition-colors ${
                i === idx ? "border-primary ring-1 ring-primary" : "hover:bg-accent/40"
              } ${m.labels.includes("IMPORTANT") || m.labels.includes("STARRED") ? "border-l-4 border-l-warning" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate text-sm font-semibold">{m.subject || "(no subject)"}</div>
                <div className="shrink-0 text-xs text-muted-foreground">{m.date}</div>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{m.from}</div>
              <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.snippet}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {m.labels.slice(0, 4).map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
            </button>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

function DocumentDialog({
  source,
  onClose,
}: {
  source: { subject: string; text: string } | null;
  onClose: () => void;
}) {
  const doc = React.useMemo(
    () => (source ? buildDocument(source.subject, source.text) : null),
    [source],
  );
  return (
    <Dialog open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Email document</DialogTitle>
        </DialogHeader>
        {doc ? (
          <div className="grid max-h-75vh grid-cols-1 gap-4 overflow-auto md:grid-cols-2">
            <Textarea value={source?.text ?? ""} readOnly rows={18} />
            <article className="prose-reader rounded-md border bg-card p-4">
              <h1>{doc.title}</h1>
              <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</p>
              <h2>Overview</h2>
              {doc.overview.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <h2>Action Items</h2>
              <ul>
                {doc.actions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <h2>Details</h2>
              <ul>
                {doc.details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function buildDocument(subject: string, text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const actions = lines.filter((line) =>
    /\b(need|must|should|deadline|due|asap|urgent|required|please|by\s+\w+)/i.test(line),
  );
  const details = lines.filter((line) => !actions.includes(line)).slice(0, 12);
  return {
    title: subject || lines[0] || "Email Document",
    overview: details.slice(0, 3).length > 0 ? details.slice(0, 3) : ["No overview detected."],
    actions: actions.length > 0 ? actions : ["No explicit action items detected."],
    details: details.slice(3).length > 0 ? details.slice(3) : details,
  };
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
