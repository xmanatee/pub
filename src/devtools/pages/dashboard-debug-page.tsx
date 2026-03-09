import { FileText, Key, Play, User } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PubsGrid } from "~/features/dashboard/components/pubs-grid";
import type { Id } from "../../../convex/_generated/dataModel";

const noop = () => {};
const fakeId = (n: number) => `fake_${n}` as Id<"pubs">;

const HTML_PREVIEW = `<h1 style="color:#2563eb;font-size:24px;margin:16px">Hello World</h1>
<p style="margin:0 16px;color:#555">This is an HTML pub with styled content.</p>`;

const TEXT_PREVIEW = `# Meeting Notes\n\n- Discussed project timeline\n- Assigned tasks to team\n- Next meeting: Friday`;

const MARKDOWN_PREVIEW = `## API Documentation\n\n\`\`\`javascript\nconst response = await fetch("/api/v1/pubs");\nconst data = await response.json();\n\`\`\``;

const SAMPLE_CREATED_AT = {
  helloWorld: Date.parse("2026-01-02T10:00:00.000Z"),
  meetingNotes: Date.parse("2026-01-04T10:00:00.000Z"),
  apiDocs: Date.parse("2026-01-05T10:00:00.000Z"),
  emptyPub: Date.parse("2025-12-28T10:00:00.000Z"),
};

const SAMPLE_PUBS = [
  {
    _id: fakeId(1),
    slug: "hello-world",
    title: "Hello World",
    contentType: "html" as const,
    isPublic: true,
    createdAt: SAMPLE_CREATED_AT.helloWorld,
    contentPreview: HTML_PREVIEW,
  },
  {
    _id: fakeId(2),
    slug: "meeting-notes",
    title: "Meeting Notes",
    contentType: "text" as const,
    isPublic: false,
    createdAt: SAMPLE_CREATED_AT.meetingNotes,
    contentPreview: TEXT_PREVIEW,
  },
  {
    _id: fakeId(3),
    slug: "api-docs",
    title: "API Documentation",
    contentType: "markdown" as const,
    isPublic: true,
    createdAt: SAMPLE_CREATED_AT.apiDocs,
    contentPreview: MARKDOWN_PREVIEW,
  },
  {
    _id: fakeId(4),
    slug: "empty-pub",
    contentType: undefined,
    isPublic: false,
    createdAt: SAMPLE_CREATED_AT.emptyPub,
    contentPreview: "",
  },
];

const LIVE_STATUS_BY_SLUG = new Map<string, boolean>([
  ["hello-world", true],
  ["api-docs", false],
]);

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
            liveStatusBySlug={LIVE_STATUS_BY_SLUG}
            status="Exhausted"
            onLoadMore={noop}
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
            liveStatusBySlug={new Map<string, boolean>([["hello-world", true]])}
            status="Exhausted"
            onLoadMore={noop}
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
