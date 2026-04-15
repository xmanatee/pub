import { Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import type { TrackerEntry } from "~/commands/results";
import { ErrorState } from "~/components/shell/error-state";
import { PageHeader } from "~/components/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SkeletonList } from "~/components/ui/skeleton-list";
import { fmtDate, fmtTime } from "~/lib/fmt";
import { tryInvoke, useCommand } from "~/lib/pub";

const COMMON_CATEGORIES = ["work", "exercise", "meal", "errand", "study", "rest"];

function groupByDay(
  entries: TrackerEntry[],
): { day: string; ts: number; entries: TrackerEntry[] }[] {
  const map = new Map<string, { day: string; ts: number; entries: TrackerEntry[] }>();
  for (const e of entries) {
    const d = new Date(e.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!map.has(key)) map.set(key, { day: fmtDate(e.ts), ts: e.ts, entries: [] });
    map.get(key)!.entries.push(e);
  }
  return Array.from(map.values()).sort((a, b) => b.ts - a.ts);
}

export function TrackerPage() {
  const list = useCommand<{ entries: TrackerEntry[] }>("tracker.list");
  const [text, setText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [aiMode, setAiMode] = React.useState(true);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSubmitting(true);
    if (await tryInvoke("tracker.add", { text: t, parse: aiMode })) {
      setText("");
      list.reload();
    }
    setSubmitting(false);
  };

  const onDelete = async (id: string) => {
    if (await tryInvoke("tracker.delete", { id })) list.reload();
  };

  const stats = React.useMemo(() => {
    if (list.status !== "loaded") return null;
    const now = Date.now();
    const today = list.value.entries.filter((e) => now - e.ts < 24 * 3600 * 1000);
    const byCat = new Map<string, number>();
    for (const e of today)
      byCat.set(e.category ?? "other", (byCat.get(e.category ?? "other") ?? 0) + 1);
    return { todayCount: today.length, byCat };
  }, [list]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Tracker"
        description="A timestamped log of anything you want to remember."
        onRefresh={list.reload}
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
          title="Toggle AI categorization"
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
            {list.status === "error" ? (
              <ErrorState error={list.error} onRetry={list.reload} />
            ) : list.status === "loading" || list.status === "idle" ? (
              <SkeletonList count={6} itemClassName="h-12" />
            ) : list.value.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              groupByDay(list.value.entries).map((g) => (
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
                          {fmtTime(entry.ts)}
                        </div>
                        <div className="min-w-0 flex-1 text-sm">{entry.text}</div>
                        {entry.category ? (
                          <Badge variant="secondary" className="shrink-0">
                            {entry.category}
                          </Badge>
                        ) : null}
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
                <div className="text-3xl font-semibold">{stats?.todayCount ?? "—"}</div>
                <div className="text-xs text-muted-foreground">entries today</div>
              </div>
              <div className="space-y-1.5">
                {stats &&
                  Array.from(stats.byCat.entries()).map(([cat, n]) => (
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
                  {COMMON_CATEGORIES.map((c) => (
                    <Badge key={c} variant="muted">
                      {c}
                    </Badge>
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
