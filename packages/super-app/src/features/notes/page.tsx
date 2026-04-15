import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { cn } from "~/core/cn";
import { fmtDate } from "~/core/fmt";
import { useAsync, withErrorAlert } from "~/core/pub";
import { EmptyState } from "~/core/shell/empty-state";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { notes } from "./client";
import type { Note } from "./commands";

export function NotesPage() {
  const { state, reload } = useAsync(() => notes.list().then((r) => r.entries), []);
  const [selected, setSelected] = React.useState<Note | null>(null);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");

  React.useEffect(() => {
    setTitle(selected?.title ?? "");
    setBody(selected?.body ?? "");
  }, [selected]);

  const save = () =>
    withErrorAlert(async () => {
      if (selected) await notes.update(selected.id, title, body);
      else await notes.create(title, body);
      setSelected(null);
      reload();
    });

  const onDelete = async (id: string) => {
    if (!confirm("Delete note?")) return;
    await withErrorAlert(async () => {
      await notes.delete(id);
      if (selected?.id === id) setSelected(null);
      reload();
    });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Notes"
        onRefresh={reload}
        actions={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelected(null)}
            aria-label="New note"
          >
            <Plus />
          </Button>
        }
      />
      <div className="grid flex-1 min-h-0 grid-cols-[minmax(18rem,1fr)_2fr] divide-x">
        <div className="flex min-h-0 flex-col">
          {state.status === "loading" ? (
            <SkeletonList count={6} itemClassName="h-16" className="space-y-2 p-3" />
          ) : state.status === "error" ? (
            <ErrorState error={state.error} onRetry={reload} />
          ) : state.value.length === 0 ? (
            <EmptyState title="No notes yet" description="Create one to get started." />
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-1 p-2">
                {state.value.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "group flex items-start gap-2 rounded-md p-2 transition-colors",
                      selected?.id === n.id ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(n)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-medium">{n.title || "Untitled"}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {fmtDate(n.updatedAt ?? n.createdAt)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(n.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-3 p-6">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="text-lg"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write…"
            className="flex-1 min-h-0 resize-none rounded-md border bg-transparent p-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            {selected ? (
              <Button variant="outline" onClick={() => setSelected(null)}>
                Cancel
              </Button>
            ) : null}
            <Button onClick={save} disabled={!title.trim() && !body.trim()}>
              {selected ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
