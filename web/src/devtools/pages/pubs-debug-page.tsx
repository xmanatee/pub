import type { Id } from "@backend/_generated/dataModel";
import { Play } from "lucide-react";
import { PubCard } from "~/features/pubs/components/pub-card";
import type { PubGridItem } from "~/features/pubs/components/pubs-grid";

const noop = () => {};
const fakeId = (n: number) => `fake_${n}` as Id<"pubs">;

const SAMPLE_PUBS: PubGridItem[] = [
  {
    _id: fakeId(1),
    slug: "hello-world",
    title: "Hello World",
    previewHtml:
      '<h1 style="color:#2563eb;font-size:24px;margin:16px">Hello World</h1><p style="margin:0 16px;color:#555">This is an HTML pub with styled content.</p>',
    isPublic: true,
    createdAt: Date.parse("2026-01-02T10:00:00.000Z"),
    updatedAt: Date.parse("2026-01-10T10:00:00.000Z"),
    lastViewedAt: Date.parse("2026-01-15T10:00:00.000Z"),
    viewCount: 142,
  },
  {
    _id: fakeId(2),
    slug: "meeting-notes",
    title: "Meeting Notes",
    previewHtml:
      '<h2 style="margin:16px">Meeting Notes</h2><ul style="margin:0 16px;color:#555"><li>Discussed project timeline</li><li>Assigned tasks</li></ul>',
    isPublic: false,
    createdAt: Date.parse("2026-01-04T10:00:00.000Z"),
    updatedAt: Date.parse("2026-01-06T10:00:00.000Z"),
    viewCount: 0,
  },
  {
    _id: fakeId(3),
    slug: "api-docs",
    title: "API Documentation",
    isPublic: true,
    createdAt: Date.parse("2026-01-05T10:00:00.000Z"),
    updatedAt: Date.parse("2026-01-12T10:00:00.000Z"),
    lastViewedAt: Date.parse("2026-01-14T10:00:00.000Z"),
    viewCount: 8,
  },
  {
    _id: fakeId(4),
    slug: "empty-pub",
    isPublic: false,
    createdAt: Date.parse("2025-12-28T10:00:00.000Z"),
    updatedAt: Date.parse("2025-12-28T10:00:00.000Z"),
    viewCount: 0,
  },
];

const LIVE_SLUGS = new Set<string>(["hello-world", "api-docs"]);

function PubCardGrid({ pubs, liveSlugs }: { pubs: PubGridItem[]; liveSlugs: Set<string> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {pubs.map((pub) => (
        <PubCard
          key={pub._id}
          pub={pub}
          isLive={liveSlugs.has(pub.slug)}
          onToggleVisibility={noop}
          onDelete={noop}
        />
      ))}
    </div>
  );
}

export function PubsDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Pubs Debug</h1>

        <section data-testid="batch-pubs-nav" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">App Nav Preview</div>
          <nav className="flex items-center gap-1">
            <span className="text-sm font-medium text-foreground px-2 py-1 rounded-md">Pubs</span>
            <span className="text-sm text-muted-foreground px-2 py-1 rounded-md">Agents</span>
            <span className="text-sm text-muted-foreground px-2 py-1 rounded-md">Explore</span>
          </nav>
        </section>

        <section data-testid="batch-pubs-cards" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">Pub Cards — All Variants</div>
          <PubCardGrid pubs={SAMPLE_PUBS} liveSlugs={LIVE_SLUGS} />
        </section>

        <section data-testid="batch-pubs-gallery" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">
            Full Gallery — Cards with Live Tags
          </div>
          <PubCardGrid pubs={SAMPLE_PUBS} liveSlugs={new Set<string>(["hello-world"])} />
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
