import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { FileText } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { api } from "../../convex/_generated/api";

const PREVIEW_STYLES = `<style>
*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
body{margin:0;padding:12px;font-family:system-ui,sans-serif;font-size:11px;line-height:1.5;overflow:hidden;color:#1a1a1a}
pre{background:#f5f5f5;padding:.5em;overflow:hidden;border-radius:3px;font-size:10px}
code{background:#f5f5f5;padding:.1em .3em;border-radius:2px;font-size:10px}
img{max-width:100%;height:auto}
</style>`;

function buildSrcdoc(content: string, contentType: string) {
  if (contentType === "html") return `${PREVIEW_STYLES}${content}`;
  if (contentType === "text")
    return `${PREVIEW_STYLES}<pre style="white-space:pre-wrap;font-size:10px">${escapeHtml(content)}</pre>`;
  return `${PREVIEW_STYLES}<div>${escapeHtml(content)}</div>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const Route = createFileRoute("/explore")({
  component: ExplorePage,
});

function ExplorePage() {
  const {
    results: publications,
    status,
    loadMore,
  } = usePaginatedQuery(api.publications.listPublic, {}, { initialNumItems: 25 });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Browse public publications from the community
        </p>
      </div>

      {status === "LoadingFirstPage" && (
        <div className="text-muted-foreground py-8">Loading...</div>
      )}

      {status !== "LoadingFirstPage" && publications.length === 0 && (
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-medium mb-1">No public publications yet</p>
            <p className="text-sm text-muted-foreground">Be the first to publish something!</p>
          </CardContent>
        </Card>
      )}

      {publications.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {publications.map((pub) => (
            <Link key={pub.slug} to="/p/$slug" params={{ slug: pub.slug }} className="group">
              <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20">
                <div className="relative aspect-[1200/630] overflow-hidden bg-white">
                  <iframe
                    srcDoc={buildSrcdoc(pub.contentPreview, pub.contentType)}
                    sandbox=""
                    loading="lazy"
                    title={pub.title || pub.slug}
                    className="h-full w-full border-none pointer-events-none"
                  />
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
              <Button variant="outline" size="sm" onClick={() => loadMore(25)}>
                Load more
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="col-span-full text-center pt-4 text-muted-foreground text-sm">
              Loading more...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
