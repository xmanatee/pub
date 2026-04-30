import { Plus, Trash2 } from "lucide-react";
import { marked } from "marked";
import * as React from "react";
import { AIActionPanel } from "~/core/ai/action-panel";
import { fmtDate } from "~/core/fmt";
import { useConfirm } from "~/core/hooks/use-confirm";
import { useDebouncedSave } from "~/core/hooks/use-debounced-save";
import { useTryToast } from "~/core/hooks/use-toast";
import { useIncomingTarget } from "~/core/navigation/use-target-navigation";
import { useAsync } from "~/core/pub";
import { ListDetail, type ListDetailItemsState } from "~/core/shell/list-detail";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/core/ui/tabs";
import { Textarea } from "~/core/ui/textarea";
import { notesApi } from "./client";
import type { Note } from "./commands";

export function NotesPage() {
  const confirm = useConfirm();
  const tryToast = useTryToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const { state, reload } = useAsync(() => notesApi.list().then((r) => r.entries), []);
  const incoming = useIncomingTarget("notes");

  React.useEffect(() => {
    if (!incoming.target) return;
    const ctx = incoming.target.context;
    void notesApi
      .create(ctx.fields?.title ?? `From ${ctx.sourceServiceId}`, ctx.excerpt)
      .then(({ entry }) => {
        setSelectedId(entry.id);
        reload();
      })
      .catch((err) => tryToast(() => Promise.reject(err), { errorTitle: "Couldn't create note" }));
    incoming.consume();
  }, [incoming, reload, tryToast]);

  const onCreate = async () => {
    const { entry } = await notesApi.create("Untitled", "");
    setSelectedId(entry.id);
    reload();
  };

  const onDelete = async (note: Note) => {
    const ok = await confirm({ title: "Delete this note?", description: note.title, danger: true });
    if (!ok) return;
    await notesApi.delete(note.id);
    if (selectedId === note.id) setSelectedId(null);
    reload();
  };

  const itemsState: ListDetailItemsState<Note> = React.useMemo(() => {
    if (state.status === "loading") return { status: "loading" };
    if (state.status === "error") return { status: "error", error: state.error };
    return { status: "loaded", items: state.value };
  }, [state]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Notes"
        onRefresh={reload}
        actions={
          <Button size="sm" onClick={onCreate}>
            <Plus className="size-3.5" /> New
          </Button>
        }
      />
      <div className="min-h-0 flex-1">
        <ListDetail
          state={itemsState}
          selectedId={selectedId}
          onSelect={setSelectedId}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search notes…"
          filter={(n, q) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)}
          onRetry={reload}
          emptyTitle="No notes yet"
          emptyDescription="Create one to get started."
          emptyAction={<Button onClick={onCreate}>Create note</Button>}
          renderRow={(n) => (
            <div className="px-2 py-2">
              <div className="truncate text-sm font-medium">{n.title || "Untitled"}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
              <div className="mt-1 text-tiny text-muted-foreground">
                {fmtDate(n.updatedAt ?? n.createdAt)}
              </div>
            </div>
          )}
          renderDetail={(note) => (
            <NoteEditor
              key={note.id}
              note={note}
              onChange={() => reload()}
              onDelete={() => onDelete(note)}
            />
          )}
        />
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  onChange,
  onDelete,
}: {
  note: Note;
  onChange: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = React.useState(note.title);
  const [body, setBody] = React.useState(note.body);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync only on note swap
  React.useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
  }, [note.id]);

  const { saving } = useDebouncedSave({ title, body }, async (next) => {
    if (next.title === note.title && next.body === note.body) return;
    await notesApi.update(note.id, next.title, next.body);
    onChange();
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-6 py-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="text-base font-medium"
        />
        <span className="text-xs text-muted-foreground">{saving ? "Saving…" : "Saved"}</span>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
          <Trash2 />
        </Button>
      </div>
      <Tabs defaultValue="edit" className="flex flex-1 min-h-0 flex-col">
        <div className="shrink-0 border-b px-6 py-2">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="edit" className="px-6 py-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write… (markdown supported)"
            className="h-full min-h-0 resize-none"
          />
        </TabsContent>
        <TabsContent value="preview" className="min-h-0">
          <ScrollArea className="h-full">
            <article
              className="prose-reader mx-auto max-w-prose px-6 py-6"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: marked returns sanitized markdown
              dangerouslySetInnerHTML={{ __html: marked.parse(body, { async: false }) as string }}
            />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="ai" className="min-h-0 p-6">
          <AIActionPanel
            sourceServiceId="notes"
            sourceItemId={note.id}
            text={[title, body].filter(Boolean).join("\n\n")}
            allow={["draft-email", "create-event", "create-task"]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
