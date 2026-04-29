import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { AIActionPanel } from "~/core/ai/action-panel";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { cn } from "~/core/cn";
import { fmtDate } from "~/core/fmt";
import { useConfirm } from "~/core/hooks/use-confirm";
import { useTryToast } from "~/core/hooks/use-toast";
import { useIncomingTarget } from "~/core/navigation/use-target-navigation";
import { useAsync } from "~/core/pub";
import { ListDetail, type ListDetailItemsState } from "~/core/shell/list-detail";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/core/ui/dropdown-menu";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Select } from "~/core/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/core/ui/tabs";
import { Textarea } from "~/core/ui/textarea";
import { tasksApi } from "./client";
import {
  TASK_CATEGORIES,
  TASK_ESTIMATES,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  type Task,
  type TaskCategory,
  type TaskEstimate,
  type TaskPriority,
  type TaskRecurrence,
} from "./commands";
import { compareForActiveList, filterForView, recurrenceLabel, type SmartView } from "./model";

const PRIORITY_VARIANT: Record<TaskPriority, "destructive" | "warning" | "default" | "muted"> = {
  urgent: "destructive",
  high: "warning",
  medium: "default",
  low: "muted",
};

export function TasksPage() {
  const confirm = useConfirm();
  const tryToast = useTryToast();
  const [view, setView] = React.useState<SmartView>("all");
  const [showArchived, setShowArchived] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [triaging, setTriaging] = React.useState(false);

  const { state, reload } = useAsync(() => tasksApi.list().then((r) => r.entries), []);
  const incoming = useIncomingTarget("tasks");

  // Cross-feature payload: prefill the new-task input.
  React.useEffect(() => {
    if (incoming.target) {
      setDraft(incoming.target.context.excerpt.slice(0, 200));
      incoming.consume();
    }
  }, [incoming]);

  const allTasks = state.status === "loaded" ? state.value : [];
  const archivedCount = allTasks.filter((t) => t.status === "archived").length;
  const inboxCount = allTasks.filter((t) => t.status === "analyzing").length;

  const visible = showArchived
    ? allTasks.filter((t) => t.status === "archived")
    : filterForView(allTasks, view).slice().sort(compareForActiveList);

  const itemsState: ListDetailItemsState<Task> = React.useMemo(() => {
    if (state.status === "loading") return { status: "loading" };
    if (state.status === "error") return { status: "error", error: state.error };
    return { status: "loaded", items: visible };
  }, [state, visible]);

  const onCreate = async () => {
    const title = draft.trim();
    if (!title) return;
    setCreating(true);
    setDraft("");
    try {
      const { entry } = await tasksApi.create(title);
      reload();
      // Run AI analysis in background; persist patch when it returns.
      const context = allTasks
        .filter((t) => t.status === "active" && (t.priority === "urgent" || t.priority === "high"))
        .slice(0, 8)
        .map((t) => `- [${t.priority}] ${t.title}`)
        .join("\n");
      try {
        const analysis = await runAI<TaskAnalysis>(prompts.analyzeTask, {
          text: title,
          context: context || "(none)",
        });
        await tasksApi.update(entry.id, applyAnalysis(analysis));
        reload();
      } catch (err) {
        await tasksApi.update(entry.id, { status: "active", analyzed: false });
        reload();
        throw err;
      }
    } catch (err) {
      tryToast(() => Promise.reject(err), { errorTitle: "Couldn't analyze task" });
    } finally {
      setCreating(false);
    }
  };

  const triage = async () => {
    if (allTasks.length === 0) return;
    setTriaging(true);
    try {
      const active = allTasks.filter((t) => t.status === "active");
      const result = await runAI<{ changes: TriageChange[] }>(prompts.triageTasks, {
        tasks: JSON.stringify(
          active.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            category: t.category,
          })),
        ),
      });
      const byId = new Map(active.map((t) => [t.id, t]));
      for (const ch of result.changes ?? []) {
        if (!byId.has(ch.id)) continue;
        await tasksApi.update(ch.id, { priority: ch.priority });
      }
      reload();
    } catch (err) {
      tryToast(() => Promise.reject(err), { errorTitle: "Triage failed" });
    } finally {
      setTriaging(false);
    }
  };

  const onComplete = async (task: Task) => {
    if (task.recurrence) {
      await tasksApi.update(task.id, { lastCompletedAt: Date.now() });
    } else {
      await tasksApi.update(task.id, { status: "done" });
    }
    reload();
  };

  const onArchive = async (task: Task) => {
    await tasksApi.update(task.id, { status: "archived" });
    if (selectedId === task.id) setSelectedId(null);
    reload();
  };

  const onUnarchive = async (task: Task) => {
    await tasksApi.update(task.id, { status: "active" });
    reload();
  };

  const onDelete = async (task: Task) => {
    const ok = await confirm({
      title: "Delete this task?",
      description: task.title,
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await tasksApi.delete(task.id);
    if (selectedId === task.id) setSelectedId(null);
    reload();
  };

  const onPatch = async (id: string, patch: Partial<Task>) => {
    await tasksApi.update(id, patch);
    reload();
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Tasks"
        description={`${visible.length} ${showArchived ? "archived" : view}${archivedCount && !showArchived ? ` · ${archivedCount} archived` : ""}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={triage}
            disabled={triaging || allTasks.length === 0}
          >
            {triaging ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Triage
          </Button>
        }
        onRefresh={reload}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate();
        }}
        className="flex shrink-0 items-center gap-2 border-b px-6 py-3"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What needs to be done? AI will categorize and suggest subtasks."
          autoFocus
          disabled={creating}
        />
        <Button type="submit" disabled={!draft.trim() || creating} size="icon">
          {creating ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>
      </form>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-6 py-2">
        <Tabs
          value={showArchived ? "archived" : view}
          onValueChange={(v) => {
            if (v === "archived") setShowArchived(true);
            else {
              setShowArchived(false);
              setView(v as SmartView);
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="priority">Priority</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="inbox">Inbox{inboxCount > 0 ? ` · ${inboxCount}` : ""}</TabsTrigger>
            <TabsTrigger value="archived" className="text-muted-foreground">
              Archived
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1">
        <ListDetail
          state={itemsState}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRetry={reload}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search tasks…"
          filter={(task, q) => task.title.toLowerCase().includes(q)}
          emptyTitle={
            showArchived ? "No archived tasks" : view === "inbox" ? "Inbox empty" : "No tasks"
          }
          emptyDescription={
            view === "inbox"
              ? "Tasks being analyzed appear here briefly."
              : "Type above to add one."
          }
          renderRow={(task) => (
            <TaskRow
              task={task}
              onComplete={() => onComplete(task)}
              onArchive={() => onArchive(task)}
              onUnarchive={() => onUnarchive(task)}
              onDelete={() => onDelete(task)}
            />
          )}
          renderDetail={(task) => (
            <TaskDetail
              task={task}
              onPatch={(patch) => onPatch(task.id, patch)}
              onComplete={() => onComplete(task)}
              onArchive={() => onArchive(task)}
              onUnarchive={() => onUnarchive(task)}
              onDelete={() => onDelete(task)}
            />
          )}
        />
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onComplete,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  task: Task;
  onComplete: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const subtaskProgress =
    task.subtasks.length > 0
      ? `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`
      : null;
  return (
    <div className="group flex items-start gap-2 px-2 py-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        aria-label="Mark done"
        className="mt-0.5 text-muted-foreground hover:text-primary"
      >
        <CheckCircle2 className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              task.status === "done" && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </div>
          {task.status === "analyzing" ? (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {task.status !== "analyzing" ? (
            <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
          ) : null}
          {task.category !== "other" ? (
            <Badge variant="outline" className="capitalize">
              {task.category}
            </Badge>
          ) : null}
          {task.estimatedTime ? <Badge variant="muted">{task.estimatedTime}</Badge> : null}
          {subtaskProgress ? (
            <Badge variant="muted" className="font-mono">
              {subtaskProgress}
            </Badge>
          ) : null}
          {task.recurrence ? (
            <Badge variant="muted">{recurrenceLabel(task.recurrence)}</Badge>
          ) : null}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="More"
          >
            <MoreHorizontal className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()} align="end">
          {task.status === "archived" ? (
            <DropdownMenuItem onSelect={onUnarchive}>
              <ArchiveRestore className="size-3.5" /> Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onArchive}>
              <Archive className="size-3.5" /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} danger>
            <Trash2 className="size-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface TaskDetailProps {
  task: Task;
  onPatch: (patch: Partial<Task>) => Promise<void>;
  onComplete: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}

function TaskDetail({
  task,
  onPatch,
  onComplete,
  onArchive,
  onUnarchive,
  onDelete,
}: TaskDetailProps) {
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const tryToast = useTryToast();

  const submitComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setSubmitting(true);
    setComment("");
    try {
      const result = await runAI<TaskCommentResponse>(prompts.processTaskComment, {
        task: JSON.stringify({
          title: task.title,
          priority: task.priority,
          category: task.category,
          estimatedTime: task.estimatedTime,
          subtasks: task.subtasks,
          note: task.note,
        }),
        comment: text,
      });
      const newComment = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        comment: text,
        reply: result.reply,
      };
      await onPatch({
        ...(result.patch ?? {}),
        comments: [...task.comments, newComment],
      });
    } catch (err) {
      tryToast(() => Promise.reject(err), { errorTitle: "Couldn't process comment" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSubtask = (subtaskId: string) => {
    const next = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    onPatch({ subtasks: next });
  };

  const updateSubtaskText = (subtaskId: string, text: string) => {
    const next = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, text } : s));
    onPatch({ subtasks: next });
  };

  const addSubtask = () => {
    const next = [
      ...task.subtasks,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
        text: "",
        done: false,
      },
    ];
    onPatch({ subtasks: next });
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <Input
            value={task.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className="text-base font-medium"
          />
          <p className="text-xs text-muted-foreground">
            Created {fmtDate(task.createdAt)}
            {task.analyzed ? " · analyzed" : null}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select
              value={task.priority}
              onChange={(e) => onPatch({ priority: e.target.value as TaskPriority })}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select
              value={task.category}
              onChange={(e) => onPatch({ category: e.target.value as TaskCategory })}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimate">
            <Select
              value={task.estimatedTime ?? ""}
              onChange={(e) =>
                onPatch({ estimatedTime: (e.target.value || null) as TaskEstimate | null })
              }
            >
              <option value="">—</option>
              {TASK_ESTIMATES.map((est) => (
                <option key={est} value={est}>
                  {est}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Recurrence">
            <Select
              value={task.recurrence ?? ""}
              onChange={(e) =>
                onPatch({ recurrence: (e.target.value || null) as TaskRecurrence | null })
              }
            >
              <option value="">none</option>
              {TASK_RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Field label="Subtasks" inline />
            <button
              type="button"
              onClick={addSubtask}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              + add
            </button>
          </div>
          {task.subtasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">None.</p>
          ) : (
            <div className="space-y-1">
              {task.subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={() => toggleSubtask(s.id)}
                    aria-label="Toggle subtask"
                  />
                  <Input
                    value={s.text}
                    onChange={(e) => updateSubtaskText(s.id, e.target.value)}
                    className={cn(
                      "h-7 border-0 bg-transparent px-1 shadow-none",
                      s.done && "text-muted-foreground line-through",
                    )}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label="Note">
          <Textarea
            value={task.note ?? ""}
            onChange={(e) => onPatch({ note: e.target.value || null })}
            rows={2}
            placeholder="Context, links, or background…"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {task.status !== "done" ? (
            <Button onClick={onComplete}>
              <CheckCircle2 className="size-3.5" /> Mark done
            </Button>
          ) : null}
          {task.status === "archived" ? (
            <Button variant="outline" onClick={onUnarchive}>
              <ArchiveRestore className="size-3.5" /> Unarchive
            </Button>
          ) : (
            <Button variant="outline" onClick={onArchive}>
              <Archive className="size-3.5" /> Archive
            </Button>
          )}
          <Button variant="outline" onClick={onDelete}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>

        <div className="space-y-2">
          <Field label="Comments" inline />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitComment();
            }}
            className="flex gap-2"
          >
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ask AI to refine…"
              disabled={submitting}
            />
            <Button type="submit" disabled={!comment.trim() || submitting}>
              {submitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
            </Button>
          </form>
          <div className="space-y-2">
            {task.comments.map((c) => (
              <div key={c.id} className="rounded-md border bg-card p-2 text-xs">
                <div className="text-foreground">{c.comment}</div>
                <div className="mt-1 text-muted-foreground">{c.reply}</div>
              </div>
            ))}
          </div>
        </div>

        <AIActionPanel
          sourceServiceId="tasks"
          sourceItemId={task.id}
          text={[task.title, task.note ?? ""].filter(Boolean).join("\n\n")}
          allow={["draft-email", "create-event", "create-note"]}
        />
      </div>
    </ScrollArea>
  );
}

function Field({
  label,
  children,
  inline,
}: {
  label: string;
  children?: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={cn("space-y-1", inline && "inline-flex items-center gap-2 space-y-0")}>
      <div className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

interface TaskAnalysis {
  priority?: TaskPriority;
  category?: TaskCategory;
  estimatedTime?: TaskEstimate | null;
  subtasks?: string[];
  recurrence?: TaskRecurrence | null;
  note?: string | null;
}

interface TriageChange {
  id: string;
  priority: TaskPriority;
  reason: string;
}

interface TaskCommentResponse {
  reply: string;
  patch?: Partial<Task>;
}

function applyAnalysis(analysis: TaskAnalysis): Partial<Task> {
  const subtasks =
    analysis.subtasks?.map((text) => ({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
      text,
      done: false,
    })) ?? [];
  return {
    status: "active",
    analyzed: true,
    priority: analysis.priority ?? "medium",
    category: analysis.category ?? "other",
    estimatedTime: analysis.estimatedTime ?? null,
    subtasks,
    recurrence: analysis.recurrence ?? null,
    note: analysis.note ?? null,
  };
}
