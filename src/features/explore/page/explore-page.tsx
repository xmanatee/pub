import { Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { FileText } from "lucide-react";
import { PubPreviewIframe } from "~/components/pub-preview-iframe";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { getConvexSiteUrl } from "~/lib/convex-url";
import { api } from "../../../../convex/_generated/api";

const siteUrl = getConvexSiteUrl();

export function ExplorePage() {
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(api.pubs.listPublic, {}, { initialNumItems: 12 });

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <p className="text-muted-foreground text-sm mt-1">Browse public pubs from the community</p>
      </div>

      {status === "LoadingFirstPage" && <div className="text-muted-foreground py-8">Loading…</div>}

      {status !== "LoadingFirstPage" && pubs.length === 0 && (
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium mb-1">No public pubs yet</p>
            <p className="text-sm text-muted-foreground">
              Be the first to share an agent page or visual!
            </p>
          </CardContent>
        </Card>
      )}

      {pubs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pubs.map((pub) => (
            <Link key={pub.slug} to="/p/$slug" params={{ slug: pub.slug }} className="group">
              <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20">
                <div className="aspect-[1200/630] overflow-hidden bg-white">
                  <PubPreviewIframe
                    content={pub.contentPreview}
                    htmlSrc={`${siteUrl}/serve/${pub.slug}?preview=1`}
                    title={pub.title || pub.slug}
                  />
                </div>
                <CardContent className="px-4 py-3">
                  <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                    {pub.title || pub.slug}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(pub.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}

          {status === "CanLoadMore" && (
            <div className="col-span-full text-center pt-4">
              <Button variant="outline" size="sm" onClick={() => loadMore(12)}>
                Load more
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="col-span-full text-center pt-4 text-muted-foreground text-sm">
              Loading more…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
