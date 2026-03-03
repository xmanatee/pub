import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { FileText } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { buildTextSrcdoc } from "~/lib/pub-preview";
import { api } from "../../convex/_generated/api";

const siteUrl = import.meta.env.VITE_CONVEX_URL
  ? import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site")
  : "";

export const Route = createFileRoute("/explore")({
  component: ExplorePage,
});

function ExplorePage() {
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(api.pubs.listPublic, {}, { initialNumItems: 12 });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <p className="text-muted-foreground text-sm mt-1">Browse public pubs from the community</p>
      </div>

      {status === "LoadingFirstPage" && (
        <div className="text-muted-foreground py-8">Loading\u2026</div>
      )}

      {status !== "LoadingFirstPage" && pubs.length === 0 && (
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium mb-1">No public pubs yet</p>
            <p className="text-sm text-muted-foreground">Be the first to publish something!</p>
          </CardContent>
        </Card>
      )}

      {pubs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pubs.map((pub) => (
            <Link key={pub.slug} to="/p/$slug" params={{ slug: pub.slug }} className="group">
              <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20">
                <div className="aspect-[1200/630] overflow-hidden bg-white">
                  {pub.contentType === "html" ? (
                    <iframe
                      src={`${siteUrl}/serve/${pub.slug}?preview=1`}
                      sandbox="allow-scripts"
                      loading="lazy"
                      tabIndex={-1}
                      title={pub.title || pub.slug}
                      className="h-full w-full border-none pointer-events-none"
                    />
                  ) : (
                    <iframe
                      srcDoc={buildTextSrcdoc(pub.contentPreview, pub.contentType ?? "text")}
                      sandbox=""
                      loading="lazy"
                      tabIndex={-1}
                      title={pub.title || pub.slug}
                      className="h-full w-full border-none pointer-events-none"
                    />
                  )}
                </div>
                <CardContent className="px-4 py-3">
                  <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                    {pub.title || pub.slug}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {pub.contentType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(pub.createdAt).toLocaleDateString()}
                    </span>
                  </div>
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
