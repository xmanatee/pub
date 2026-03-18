import type { Id } from "@backend/_generated/dataModel";
import { FileText, Key, Play, User } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PubsGrid } from "~/features/dashboard/components/pubs-grid";

const noop = () => {};
const fakeId = (n: number) => `fake_${n}` as Id<"pubs">;

const SAMPLE_PUBS = [
  {
    _id: fakeId(1),
    slug: "hello-world",
    title: "Hello World",
    isPublic: true,
    createdAt: Date.parse("2026-01-02T10:00:00.000Z"),
    updatedAt: Date.parse("2026-01-10T10:00:00.000Z"),
    lastViewedAt: Date.parse("2026-01-15T10:00:00.000Z"),
    content: `<h1 style="color:#2563eb;font-size:24px;margin:16px">Hello World</h1>
<p style="margin:0 16px;color:#555">This is an HTML pub with styled content.</p>`,
  },
  {
    _id: fakeId(2),
    slug: "meeting-notes",
    title: "Meeting Notes",
    isPublic: false,
    createdAt: Date.parse("2026-01-04T10:00:00.000Z"),
    updatedAt: Date.parse("2026-01-06T10:00:00.000Z"),
    content: `<h2 style="margin:16px">Meeting Notes</h2>
<ul style="margin:0 16px;color:#555"><li>Discussed project timeline</li><li>Assigned tasks</li></ul>`,
  },
  {
    _id: fakeId(3),
    slug: "api-docs",
    title: "API Documentation",
    isPublic: true,
    createdAt: Date.parse("2026-01-05T10:00:00.000Z"),
    updatedAt: Date.parse("2026-01-12T10:00:00.000Z"),
    lastViewedAt: Date.parse("2026-01-14T10:00:00.000Z"),
    content: `<h2 style="margin:16px">API Documentation</h2>
<pre style="margin:0 16px;background:#f5f5f5;padding:12px;border-radius:4px"><code>const res = await fetch("/api/v1/pubs");</code></pre>`,
  },
  {
    _id: fakeId(4),
    slug: "empty-pub",
    isPublic: false,
    createdAt: Date.parse("2025-12-28T10:00:00.000Z"),
    updatedAt: Date.parse("2025-12-28T10:00:00.000Z"),
    content: "",
  },
];

const LIVE_SLUGS = new Set<string>(["hello-world", "api-docs"]);

const CARDS_VIEW_COUNTS: Record<string, number> = { "hello-world": 142 };
const GALLERY_VIEW_COUNTS: Record<string, number> = { "hello-world": 142, "api-docs": 8 };

export function DashboardDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Dashboard Debug</h1>

        <section data-testid="batch-dashboard-tabs" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">Dashboard Tabs</div>
          <Tabs defaultValue="keys">
            <TabsList>
              <TabsTrigger value="pubs">
                <FileText className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Pubs
              </TabsTrigger>
              <TabsTrigger value="keys">
                <Key className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Agent and Keys
                <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                  3
                </span>
              </TabsTrigger>
              <TabsTrigger value="account">
                <User className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Account
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        <section data-testid="batch-dashboard-cards" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">Pub Cards — All Variants</div>
          <PubsGrid
            pubs={SAMPLE_PUBS}
            viewCounts={CARDS_VIEW_COUNTS}
            liveSlugs={LIVE_SLUGS}
            onToggleVisibility={noop}
            onDelete={noop}
          />
        </section>

        <section data-testid="batch-dashboard-gallery" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">
            Full Gallery — Cards with Live Tags
          </div>
          <PubsGrid
            pubs={SAMPLE_PUBS}
            viewCounts={GALLERY_VIEW_COUNTS}
            liveSlugs={new Set<string>(["hello-world"])}
            onToggleVisibility={noop}
            onDelete={noop}
          />
        </section>
      </div>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex items-center justify-end px-3"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
      >
        <button
          type="button"
          onClick={noop}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl transition-opacity hover:opacity-90"
          aria-label="Go live"
        >
          <Play className="size-5 fill-current" />
        </button>
      </div>
    </div>
  );
}
