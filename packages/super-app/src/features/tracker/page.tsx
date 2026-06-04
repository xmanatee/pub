import { Loader2, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { fmtDate, fmtTime } from "~/core/fmt";
import { useTryToast } from "~/core/hooks/use-toast";
import { useAsync } from "~/core/pub";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { Switch } from "~/core/ui/switch";
import { parseCategoryResult } from "./ai-results";
import { trackerApi } from "./client";
import { DEFAULT_CATEGORIES, type TrackerEntry } from "./commands";

const CATEGORY_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "secondary"> =
  {
    work: "default",
    exercise: "success",
    meal: "warning",
    errand: "secondary",
    study: "default",
    rest: "muted",
    other: "muted",
  };

function categoryVariant(cat: string) {
  return CATEGORY_VARIANT[cat] ?? "muted";
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
  const tryToast = useTryToast();
  const { state, reload } = useAsync(() => trackerApi.list().then((r) => r.entries), []);
  const [text, setText] = React.useState("");
  const [aiMode, setAiMode] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [summarizing, setSummarizing] = React.useState(false);
  const [categories, setCategories] = React.useState<string[]>(DEFAULT_CATEGORIES);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSubmitting(true);
    let category: string | null = null;
    let categorizeError: unknown = null;
    if (aiMode) {
      try {
        category = await runAI(
          prompts.categorize,
          {
            text: t,
            categories: categories.join(", "),
          },
          (value) => parseCategoryResult(value, categories),
        );
      } catch (err) {
        categorizeError = err;
      }
    }
    await tryToast(
      async () => {
        await trackerApi.add(t, category);
        setText("");
        reload();
      },
      { errorTitle: "Couldn't add entry" },
    );
    if (categorizeError) {
      await tryToast(() => Promise.reject(categorizeError), {
        errorTitle: "Auto-categorization failed",
      });
    }
    setSubmitting(false);
  };

  const onDelete = async (id: string) => {
    await tryToast(
      async () => {
        await trackerApi.delete(id);
        reload();
      },
      { errorTitle: "Couldn't delete" },
    );
  };

  const summarizeToday = async () => {
    if (state.status !== "loaded") return;
    setSummarizing(true);
    setSummary(null);
    try {
      const todayMs = 24 * 3600 * 1000;
      const now = Date.now();
      const today = state.value.filter((e) => now - e.createdAt < todayMs);
      const text = await runAI(prompts.summarize, {
        text: today.map((e) => `- [${e.category ?? "uncategorized"}] ${e.text}`).join("\n"),
      });
      setSummary(text);
    } catch (err) {
      tryToast(() => Promise.reject(err), { errorTitle: "Summary failed" });
    } finally {
      setSummarizing(false);
    }
  };

  const addCategory = (raw: string) => {
    const next = raw.trim().toLowerCase();
    if (!next || categories.includes(next)) return;
    setCategories([...categories.slice(0, -1), next, "other"]);
  };

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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={aiMode} onCheckedChange={setAiMode} aria-label="Auto categorize" />
          <Sparkles className="size-3.5" />
        </div>
        <Button type="submit" disabled={!text.trim() || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null} Add
        </Button>
      </form>
      <div className="grid flex-1 min-h-0 layout-tracker divide-x">
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
                        {entry.category ? (
                          <Badge variant={categoryVariant(entry.category)}>{entry.category}</Badge>
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
        <div className="overflow-auto bg-sidebar/40 p-6">
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
                    <Badge variant={categoryVariant(cat)}>{cat}</Badge>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={summarizeToday}
                disabled={summarizing || today.length === 0}
              >
                {summarizing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}{" "}
                Summarize day
              </Button>
              {summary ? (
                <p className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed">{summary}</p>
              ) : null}
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Categories
                </div>
                <div className="flex flex-wrap gap-1">
                  {categories.map((c) => (
                    <Badge key={c} variant={categoryVariant(c)}>
                      {c}
                    </Badge>
                  ))}
                </div>
                <NewCategoryInput onAdd={addCategory} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NewCategoryInput({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = React.useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
      className="flex gap-1"
    >
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="add category…"
        className="h-7 text-xs"
      />
      <Button type="submit" variant="outline" size="sm" className="h-7" disabled={!v.trim()}>
        Add
      </Button>
    </form>
  );
}
