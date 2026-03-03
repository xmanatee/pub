import { createFileRoute, redirect } from "@tanstack/react-router";
import { Clock, ExternalLink, Radio } from "lucide-react";
import { PubCard } from "~/components/pub-card";
import { Badge } from "~/components/ui/badge";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/debug/dashboard")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: DashboardDebugPage,
});

const noop = () => {};
const fakeId = (n: number) => `fake_${n}` as Id<"pubs">;

const HTML_PREVIEW = `<h1 style="color:#2563eb;font-size:24px;margin:16px">Hello World</h1>
<p style="margin:0 16px;color:#555">This is an HTML pub with styled content.</p>`;

const TEXT_PREVIEW = `# Meeting Notes\n\n- Discussed project timeline\n- Assigned tasks to team\n- Next meeting: Friday`;

const MARKDOWN_PREVIEW = `## API Documentation\n\n\`\`\`javascript\nconst response = await fetch("/api/v1/pubs");\nconst data = await response.json();\n\`\`\``;

const SAMPLE_PUBS = [
  {
    _id: fakeId(1),
    slug: "hello-world",
    title: "Hello World",
    contentType: "html" as const,
    isPublic: true,
    createdAt: Date.now() - 86400000 * 3,
    contentPreview: HTML_PREVIEW,
  },
  {
    _id: fakeId(2),
    slug: "meeting-notes",
    title: "Meeting Notes",
    contentType: "text" as const,
    isPublic: false,
    createdAt: Date.now() - 86400000,
    contentPreview: TEXT_PREVIEW,
  },
  {
    _id: fakeId(3),
    slug: "api-docs",
    title: "API Documentation",
    contentType: "markdown" as const,
    isPublic: true,
    expiresAt: Date.now() + 3600000 * 12,
    createdAt: Date.now() - 3600000 * 6,
    contentPreview: MARKDOWN_PREVIEW,
  },
  {
    _id: fakeId(4),
    slug: "empty-pub",
    contentType: undefined,
    isPublic: false,
    createdAt: Date.now() - 86400000 * 7,
    contentPreview: "",
  },
];

function LiveBanner({
  slug,
  hasConnection,
  expiresLabel,
}: {
  slug: string;
  hasConnection: boolean;
  expiresLabel: string;
}) {
  return (
    <a
      href={`/p/${slug}`}
      className="group flex items-center justify-between rounded-lg border border-emerald-600/20 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 transition-colors hover:border-emerald-600/40"
    >
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-emerald-600 animate-pulse" aria-hidden="true" />
        <span className="font-medium text-sm">{slug}</span>
        <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-600/20 text-xs">
          {hasConnection ? "Connected" : "Waiting"}
        </Badge>
        <Badge variant="outline" className="gap-1 text-orange-600 border-orange-600/20 text-xs">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {expiresLabel}
        </Badge>
      </div>
      <ExternalLink
        className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden="true"
      />
    </a>
  );
}

function DashboardDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Dashboard Debug</h1>

        <section data-testid="batch-dashboard-cards" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">Pub Cards — All Variants</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SAMPLE_PUBS.map((pub) => (
              <PubCard
                key={pub.slug}
                pub={pub}
                viewCount={pub.slug === "hello-world" ? 142 : undefined}
                onToggleVisibility={noop}
                onDelete={noop}
              />
            ))}
          </div>
        </section>

        <section data-testid="batch-dashboard-live" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">Live Banners</div>
          <div className="space-y-2">
            <LiveBanner slug="hello-world" hasConnection expiresLabel="23h" />
            <LiveBanner slug="api-docs" hasConnection={false} expiresLabel="45m" />
          </div>
        </section>

        <section data-testid="batch-dashboard-gallery" className="bg-white p-6">
          <div className="mb-5 text-center text-sm font-semibold">
            Full Gallery — Cards + Live Banner
          </div>
          <div className="space-y-2 mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Live Now</h3>
            <LiveBanner slug="hello-world" hasConnection expiresLabel="23h" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SAMPLE_PUBS.map((pub) => (
              <PubCard
                key={pub.slug}
                pub={pub}
                viewCount={
                  pub.slug === "hello-world" ? 142 : pub.slug === "api-docs" ? 8 : undefined
                }
                onToggleVisibility={noop}
                onDelete={noop}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
