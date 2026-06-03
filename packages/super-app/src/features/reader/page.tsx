import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import * as React from "react";
import { AIActionPanel } from "~/core/ai/action-panel";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
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
  hist: string[];
  hi: number;
}

type Tab =
  | (TabCore & { status: "loading" })
  | (TabCore & { status: "loaded"; result: ReaderResult; html: string })
  | (TabCore & { status: "error"; error: string });

const SHORTCUTS = [
  { label: "Wikipedia", url: "https://wikipedia.org" },
  { label: "Hacker News", url: "https://news.ycombinator.com" },
  { label: "GitHub", url: "https://github.com" },
  { label: "Reddit", url: "https://reddit.com" },
  { label: "MDN", url: "https://developer.mozilla.org" },
  { label: "DuckDuckGo", url: "https://duckduckgo.com" },
  { label: "Stack Overflow", url: "https://stackoverflow.com" },
  { label: "NPM", url: "https://npmjs.com" },
];

function tabTitle(tab: Tab): string {
  return tab.status === "loaded" ? tab.result.title || tab.url : tab.url;
}

const makeId = () => Math.random().toString(36).slice(2, 10);

function normalize(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export function ReaderPage() {
  const [tabs, setTabs] = React.useState<Tab[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState("");
  const [rawMode, setRawMode] = React.useState(false);

  const patch = React.useCallback(
    (id: string, next: Tab) => setTabs((prev) => prev.map((t) => (t.id === id ? next : t))),
    [],
  );

  const loadInto = React.useCallback(
    async (id: string, raw: string, history: string[], targetIndex = history.length - 1) => {
      const normalized = normalize(raw);
      if (!normalized) return;
      const hi = Math.max(0, Math.min(history.length - 1, targetIndex));
      patch(id, { id, url: normalized, status: "loading", hist: history, hi });
      setActive(id);
      setUrl("");
      try {
        const html = await invoke<string>(cmd.fetchPage, { url: normalized });
        const result = await reader.simplify(normalized, html);
        patch(id, { id, url: normalized, status: "loaded", result, html, hist: history, hi });
      } catch (err) {
        patch(id, {
          id,
          url: normalized,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          hist: history,
          hi,
        });
      }
    },
    [patch],
  );

  const open = React.useCallback(
    async (raw: string) => {
      const normalized = normalize(raw);
      if (!normalized) return;
      const id = makeId();
      setTabs((prev) => [
        ...prev,
        { id, url: normalized, status: "loading", hist: [normalized], hi: 0 },
      ]);
      await loadInto(id, normalized, [normalized]);
    },
    [loadInto],
  );

  const navigateCurrent = async (raw: string) => {
    const normalized = normalize(raw);
    if (!normalized) return;
    if (!current) {
      await open(normalized);
      return;
    }
    const nextHist = [...current.hist.slice(0, current.hi + 1), normalized];
    await loadInto(current.id, normalized, nextHist);
  };

  const close = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (active === id) setActive(next[next.length - 1]?.id ?? null);
      return next;
    });
  };

  const current = tabs.find((t) => t.id === active) ?? null;
  const canBack = current ? current.hi > 0 : false;
  const canForward = current ? current.hi < current.hist.length - 1 : false;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Reader" description="Distraction-free article view with AI Q&A." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigateCurrent(url);
        }}
        className="flex shrink-0 items-center gap-2 border-b px-6 py-3"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canBack || !current}
          onClick={() =>
            current &&
            loadInto(current.id, current.hist[current.hi - 1], current.hist, current.hi - 1)
          }
          aria-label="Back"
        >
          <ArrowLeft />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canForward || !current}
          onClick={() =>
            current &&
            loadInto(current.id, current.hist[current.hi + 1], current.hist, current.hi + 1)
          }
          aria-label="Forward"
        >
          <ArrowRight />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!current}
          onClick={() => current && loadInto(current.id, current.url, current.hist, current.hi)}
          aria-label="Refresh"
        >
          <RefreshCw />
        </Button>
        <Input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="URL or search…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={!url.trim()}>
          Open
        </Button>
        <Button
          type="button"
          variant={rawMode ? "default" : "outline"}
          disabled={current?.status !== "loaded"}
          onClick={() => setRawMode((v) => !v)}
        >
          Raw
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="New tab"
            onClick={() => {
              setActive(null);
            }}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div className="flex-1 min-h-0">
        {!current ? (
          <Home onOpen={open} />
        ) : current.status === "loading" ? (
          <EmptyState
            icon={<Loader2 className="size-6 animate-spin" />}
            title="Fetching…"
            description={current.url}
          />
        ) : current.status === "error" ? (
          <ErrorState error={current.error} />
        ) : rawMode ? (
          <iframe
            title={current.url}
            srcDoc={current.html}
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <Article result={current.result} />
        )}
      </div>
    </div>
  );
}

function Home({ onOpen }: { onOpen: (url: string) => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-4 px-6 text-center">
        <Newspaper className="mx-auto size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Paste a URL above or pick a starting point.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SHORTCUTS.map((s) => (
            <Button key={s.url} variant="outline" size="sm" onClick={() => onOpen(s.url)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Article({ result }: { result: ReaderResult }) {
  return (
    <div className="grid h-full layout-article">
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
      <aside className="border-l bg-sidebar/40 p-4">
        <ScrollArea className="h-full">
          <ReaderAssistant result={result} />
        </ScrollArea>
      </aside>
    </div>
  );
}

function ReaderAssistant({ result }: { result: ReaderResult }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [output, setOutput] = React.useState<string | null>(null);
  const text = result.textContent.slice(0, 6000);
  const run = async (key: string, question: string) => {
    setBusy(key);
    setOutput(null);
    try {
      const answer = await runAI<string>(prompts.qaDocument, {
        document: text,
        question,
      });
      setOutput(answer);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => run("summary", "Summarize this page in 3-4 sentences.")}
        >
          {busy === "summary" ? <Loader2 className="animate-spin" /> : null} Summarize
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => run("points", "What are the key points or takeaways?")}
        >
          Key points
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => run("eli5", "Explain this page like I am 5.")}
        >
          ELI5
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => run("links", "List the important links mentioned and what they are for.")}
        >
          Links
        </Button>
      </div>
      {output ? (
        <div className="whitespace-pre-wrap rounded-md border bg-card p-3 text-sm">{output}</div>
      ) : null}
      <AIActionPanel
        embedded
        sourceServiceId="reader"
        sourceItemId={result.url}
        text={text}
        fields={{ title: result.title }}
        allow={["create-task", "create-note", "draft-email"]}
      />
    </div>
  );
}
