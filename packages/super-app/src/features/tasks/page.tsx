import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { cn } from "~/core/cn";
import { useAsync, withErrorAlert } from "~/core/pub";
import { EmptyState } from "~/core/shell/empty-state";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { tasks } from "./client";
import type { Task } from "./commands";

export function TasksPage() {
  const { state, reload } = useAsync(() => tasks.list().then((r) => r.entries), []);
  const [title, setTitle] = React.useState("");

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    withErrorAlert(async () => {
      await tasks.create(t);
      setTitle("");
      reload();
    });
  };

  const onToggle = (task: Task) =>
    withErrorAlert(async () => {
      await tasks.update(task.id, { completed: !task.completed });
      reload();
    });

  const onDelete = (id: string) =>
    withErrorAlert(async () => {
      await tasks.delete(id);
      reload();
    });

  const entries = state.status === "loaded" ? state.value : [];
  const pending = entries.filter((t) => !t.completed);
  const done = entries.filter((t) => t.completed);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Tasks" onRefresh={reload} />
      <form onSubmit={onCreate} className="flex shrink-0 items-center gap-2 border-b px-6 py-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          autoFocus
        />
        <Button type="submit" size="icon" disabled={!title.trim()}>
          <Plus />
        </Button>
      </form>
      <ScrollArea className="flex-1 min-h-0">
        {state.status === "loading" ? (
          <SkeletonList count={6} itemClassName="h-10" className="space-y-2 p-6" />
        ) : state.status === "error" ? (
          <ErrorState error={state.error} onRetry={reload} />
        ) : entries.length === 0 ? (
          <EmptyState title="No tasks" description="Type above to add one." />
        ) : (
          <div className="space-y-6 p-6">
            <TaskGroup label="Pending" entries={pending} onToggle={onToggle} onDelete={onDelete} />
            {done.length > 0 ? (
              <TaskGroup label="Done" entries={done} onToggle={onToggle} onDelete={onDelete} />
            ) : null}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function TaskGroup({
  label,
  entries,
  onToggle,
  onDelete,
}: {
  label: string;
  entries: Task[];
  onToggle: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="space-y-1">
        {entries.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2"
          >
            <input
              type="checkbox"
              checked={t.completed}
              onChange={() => onToggle(t)}
              aria-label="Toggle"
            />
            <span
              className={cn("flex-1 text-sm", t.completed && "text-muted-foreground line-through")}
            >
              {t.title}
            </span>
            <button
              type="button"
              onClick={() => onDelete(t.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Delete"
            >
              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
