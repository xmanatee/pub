import { ExternalLink, Loader2, Newspaper, X } from "lucide-react";
import * as React from "react";
import { cn } from "~/core/cn";
import { invoke } from "~/core/pub";
import { EmptyState } from "~/core/shell/empty-state";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { reader } from "./client";
import type { ReaderResult } from "./commands";
import * as cmd from "./commands";

interface TabCore {
  id: string;
  url: string;
}

type Tab =
  | (TabCore & { status: "loading" })
  | (TabCore & { status: "loaded"; result: ReaderResult })
  | (TabCore & { status: "error"; error: string });

function tabTitle(tab: Tab): string {
  return tab.status === "loaded" ? tab.result.title || tab.url : tab.url;
}

const makeId = () => Math.random().toString(36).slice(2, 10);

export function ReaderPage() {
  const [tabs, setTabs] = React.useState<Tab[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState("");

  const patch = (id: string, next: Tab) =>
    setTabs((prev) => prev.map((t) => (t.id === id ? next : t)));

  const open = async (raw: string) => {
    let normalized = raw.trim();
    if (!normalized) return;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    const id = makeId();
    setTabs((prev) => [...prev, { id, url: normalized, status: "loading" }]);
    setActive(id);
    setUrl("");
    try {
      const html = await invoke<string>(cmd.fetchPage, { url: normalized });
      const result = await reader.simplify(normalized, html);
      patch(id, { id, url: normalized, status: "loaded", result });
    } catch (err) {
      patch(id, {
        id,
        url: normalized,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const close = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (active === id) setActive(next[next.length - 1]?.id ?? null);
      return next;
    });
  };

  const current = tabs.find((t) => t.id === active) ?? null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Reader"
        description="Paste a URL to fetch and view a clean, distraction-free version."
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
                {t.status === "loading" ? <Loader2 className="inline size-3 animate-spin" /> : null}{" "}
                {tabTitle(t)}
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
        ) : current.status === "loading" ? (
          <EmptyState
            icon={<Loader2 className="size-6 animate-spin" />}
            title="Fetching…"
            description={current.url}
          />
        ) : current.status === "error" ? (
          <ErrorState error={current.error} />
        ) : (
          <Article result={current.result} />
        )}
      </div>
    </div>
  );
}

function Article({ result }: { result: ReaderResult }) {
  return (
    <ScrollArea className="h-full">
      <article className="mx-auto max-w-prose px-6 py-10">
        <header className="mb-6 space-y-2 border-b pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">{result.title}</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {result.byline ? <span>{result.byline}</span> : null}
            {result.siteName ? <span>· {result.siteName}</span> : null}
            <a
              href={result.url}
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
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized in reader/server.ts
          dangerouslySetInnerHTML={{ __html: result.contentHtml }}
        />
      </article>
    </ScrollArea>
  );
}
