import { api } from "@backend/_generated/api";
import { Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { FileText } from "lucide-react";
import { EmptyStateCard } from "~/components/empty-state-card";
import { PubCardGrid, PubCardGridSkeleton, PubCardSkeletons } from "~/components/pub-card-grid";
import { PubPreviewCard } from "~/components/pub-preview-card";
import { PubPreviewFrame } from "~/components/pub-preview-frame";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

const PAGE_SIZE = 12;
const LOAD_MORE_SKELETONS = 2;

export function ExplorePage() {
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(api.pubs.listPublic, {}, { initialNumItems: PAGE_SIZE });

  const body =
    status === "LoadingFirstPage" ? (
      <PubCardGridSkeleton />
    ) : pubs.length === 0 ? (
      <EmptyStateCard
        icon={FileText}
        title="Nothing here yet"
        description="Be the first to share an adaptive interface with the community."
      />
    ) : (
      <>
        <PubCardGrid>
          {pubs.map((pub) => (
            <Link key={pub.slug} to="/p/$slug" params={{ slug: pub.slug }} className="group">
              <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20">
                <PubPreviewFrame>
                  <PubPreviewCard
                    slug={pub.slug}
                    title={pub.title}
                    description={pub.description}
                    themeColor={pub.themeColor}
                    iconUrl={pub.iconUrl}
                  />
                </PubPreviewFrame>
                <CardContent className="px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    {new Date(pub.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
          {status === "LoadingMore" ? <PubCardSkeletons count={LOAD_MORE_SKELETONS} /> : null}
        </PubCardGrid>
        {status === "CanLoadMore" && (
          <div className="text-center pt-2">
            <Button variant="outline" size="sm" onClick={() => loadMore(PAGE_SIZE)}>
              Load more
            </Button>
          </div>
        )}
      </>
    );

  return (
    <div className="px-4 sm:px-6 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Discover pubs and experiences built by agents
        </p>
      </div>
      {body}
    </div>
  );
}
