import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { LiveBanners } from "~/components/dashboard/live-banners";
import { PubsGrid } from "~/components/dashboard/pubs-grid";
import { Card, CardContent } from "~/components/ui/card";
import { api } from "../../../../convex/_generated/api";

export function PubsTab() {
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(api.pubs.listByUser, {}, { initialNumItems: 12 });
  const toggleVisibility = useMutation(api.pubs.toggleVisibility);
  const deletePub = useMutation(api.pubs.deleteByUser);

  const slugs = pubs?.map((p) => p.slug) ?? [];
  const viewCounts = useQuery(api.analytics.getViewCounts, slugs.length > 0 ? { slugs } : "skip");
  const lives = useQuery(api.pubs.listActiveLives);

  if (status === "LoadingFirstPage") {
    return <div className="text-muted-foreground py-8">Loading…</div>;
  }

  if (pubs.length === 0) {
    return (
      <Card className="mt-4 border-border/50 border-dashed">
        <CardContent className="flex flex-col items-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="font-medium mb-1">No pubs yet</p>
          <p className="text-sm text-muted-foreground mb-6">
            Use the CLI or API to create your first pub.
          </p>
          <div className="rounded-lg bg-navy text-white px-4 py-3 font-mono text-sm">
            <span className="text-primary">$</span> pubblue create index.html
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      <LiveBanners lives={lives ?? []} />
      <PubsGrid
        pubs={pubs}
        viewCounts={viewCounts}
        status={status}
        onLoadMore={() => loadMore(12)}
        onToggleVisibility={(id) => toggleVisibility({ id })}
        onDelete={(id) => deletePub({ id })}
      />
    </div>
  );
}
