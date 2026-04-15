import { Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { fmtDate, fmtTime } from "~/core/fmt";
import { invoke, useAsync, withErrorAlert } from "~/core/pub";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { tracker } from "./client";
import type { TrackerEntry } from "./commands";
import * as cmd from "./commands";

const CATEGORY_STYLE: Record<string, string> = {
  work: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  exercise: "bg-green-500/15 text-green-600 dark:text-green-300",
  meal: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  errand: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  study: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  rest: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
  other: "bg-muted text-muted-foreground",
};
const CATEGORIES = Object.keys(CATEGORY_STYLE);

function CategoryBadge({ category }: { category: string }) {
  const className = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other;
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {category}
    </span>
  );
}

function groupByDay(entries: TrackerEntry[]) {
  const map = new Map<string, { day: string; ts: number; entries: TrackerEntry[] }>();
  for (const e of entries) {
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const existing = map.get(key);
    if (existing) existing.entries.push(e);
    else map.set(key, { day: fmtDate(e.createdAt), ts: e.createdAt, entries: [e] });
  }
  return Array.from(map.values()).sort((a, b) => b.ts - a.ts);
}

export function TrackerPage() {
  const { state, reload } = useAsync(() => tracker.list().then((r) => r.entries), []);
  const [text, setText] = React.useState("");
  const [aiMode, setAiMode] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSubmitting(true);
    let category: string | null = null;
    if (aiMode) {
      try {
        const result = await invoke<{ category: string }>(cmd.categorize, { text: t });
        if (CATEGORIES.includes(result.category)) category = result.category;
      } catch {
        // Agent unavailable — save the entry uncategorized.
      }
    }
    await withErrorAlert(async () => {
      await tracker.add(t, category);
      setText("");
      reload();
    });
    setSubmitting(false);
  };

  const onDelete = (id: string) =>
    withErrorAlert(async () => {
      await tracker.delete(id);
      reload();
    });

  const entries = state.status === "loaded" ? state.value : [];
  const todayMs = 24 * 3600 * 1000;
  const now = Date.now();
  const today = entries.filter((e) => now - e.createdAt < todayMs);
  const byCat = new Map<string, number>();
  for (const e of today)
    byCat.set(e.category ?? "other", (byCat.get(e.category ?? "other") ?? 0) + 1);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Tracker"
        description="A timestamped log of anything you want to remember."
        onRefresh={reload}
      />
      <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2 border-b px-6 py-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What just happened?"
          autoFocus
        />
        <Button
          type="button"
          variant={aiMode ? "default" : "outline"}
          size="icon"
          onClick={() => setAiMode((v) => !v)}
          aria-label="Toggle AI categorization"
        >
          <Sparkles />
        </Button>
        <Button type="submit" disabled={!text.trim() || submitting}>
          Add
        </Button>
      </form>
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[1fr_18rem] divide-x">
        <ScrollArea className="h-full">
          <div className="space-y-6 p-6">
            {state.status === "error" ? (
              <ErrorState error={state.error} onRetry={reload} />
            ) : state.status === "loading" ? (
              <SkeletonList count={6} itemClassName="h-12" />
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              groupByDay(entries).map((g) => (
                <div key={g.day} className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {g.day}
                  </div>
                  <div className="space-y-1.5">
                    {g.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="group flex items-start gap-3 rounded-md border bg-card px-3 py-2"
                      >
                        <div className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                          {fmtTime(entry.createdAt)}
                        </div>
                        <div className="min-w-0 flex-1 text-sm">{entry.text}</div>
                        {entry.category ? <CategoryBadge category={entry.category} /> : null}
                        <button
                          type="button"
                          onClick={() => onDelete(entry.id)}
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Delete"
                        >
                          <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="min-h-0 overflow-auto bg-sidebar/50 p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Today</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-3xl font-semibold">{today.length}</div>
                <div className="text-xs text-muted-foreground">entries today</div>
              </div>
              <div className="space-y-1.5">
                {Array.from(byCat.entries()).map(([cat, n]) => (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span className="capitalize">{cat}</span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </div>
                ))}
              </div>
              <div className="pt-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Common
                </div>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.filter((c) => c !== "other").map((c) => (
                    <CategoryBadge key={c} category={c} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
