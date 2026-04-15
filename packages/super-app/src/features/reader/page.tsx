import { ExternalLink, Loader2, Newspaper, X } from "lucide-react";
import * as React from "react";
import type { ReaderResult } from "~/commands/results";
import { EmptyState } from "~/components/shell/empty-state";
import { ErrorState } from "~/components/shell/error-state";
import { PageHeader } from "~/components/shell/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/cn";
import { invoke } from "~/lib/pub";

interface Tab {
  id: string;
  url: string;
  title: string;
  result: ReaderResult | null;
  state: "loading" | "loaded" | "error";
  error: string | null;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ReaderPage() {
  const [tabs, setTabs] = React.useState<Tab[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState("");

  const open = async (raw: string) => {
    let normalized = raw.trim();
    if (!normalized) return;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    const id = makeId();
    setTabs((prev) => [
      ...prev,
      { id, url: normalized, title: normalized, result: null, state: "loading", error: null },
    ]);
    setActive(id);
    setUrl("");
    try {
      const result = await invoke<ReaderResult>("reader.fetch", { url: normalized });
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, result, title: result.title || t.url, state: "loaded" } : t,
        ),
      );
    } catch (err) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, state: "error", error: err instanceof Error ? err.message : String(err) }
            : t,
        ),
      );
    }
  };

  const close = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (active === id) setActive(next[next.length - 1]?.id ?? null);
      return next;
    });
  };

  const current = tabs.find((t) => t.id === active);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Reader"
        description="Fetch any web page and view a clean, distraction-free version."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          open(url);
        }}
        className="flex shrink-0 items-center gap-2 border-b px-6 py-3"
      >
        <Input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={!url.trim()}>
          Open
        </Button>
      </form>
      {tabs.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 py-2">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs",
                active === t.id && "border-primary",
              )}
            >
              <button
                type="button"
                onClick={() => setActive(t.id)}
                className="max-w-64 truncate text-left"
              >
                {t.state === "loading" ? <Loader2 className="inline size-3 animate-spin" /> : null}{" "}
                {t.title}
              </button>
              <button type="button" onClick={() => close(t.id)} aria-label="Close tab">
                <X className="size-3 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex-1 min-h-0">
        {!current ? (
          <EmptyState
            icon={<Newspaper className="size-6" />}
            title="No page open"
            description="Paste a URL above to fetch and read."
          />
        ) : current.state === "loading" ? (
          <EmptyState
            icon={<Loader2 className="size-6 animate-spin" />}
            title="Fetching…"
            description={current.url}
          />
        ) : current.state === "error" ? (
          <ErrorState error={current.error ?? "Failed to fetch"} />
        ) : (
          <ScrollArea className="h-full">
            <article className="mx-auto max-w-prose px-6 py-10">
              <header className="mb-6 space-y-2 border-b pb-4">
                <h1 className="text-2xl font-semibold tracking-tight">{current.result?.title}</h1>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {current.result?.byline ? <span>{current.result.byline}</span> : null}
                  {current.result?.siteName ? <span>· {current.result.siteName}</span> : null}
                  <a
                    href={current.result?.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Original <ExternalLink className="size-3" />
                  </a>
                </div>
              </header>
              <div
                className="prose-reader"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized in reader.fetch handler
                dangerouslySetInnerHTML={{ __html: current.result?.contentHtml ?? "" }}
              />
            </article>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
