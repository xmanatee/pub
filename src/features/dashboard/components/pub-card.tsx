import { Link } from "@tanstack/react-router";
import { ExternalLink, FileText, Globe, Lock, Radio, Trash2 } from "lucide-react";
import { PubPreviewIframe } from "~/components/pub-preview-iframe";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { trackPubDeleted, trackPubLinkCopied, trackVisibilityToggled } from "~/lib/analytics";
import { telegramConfirm, telegramOpenLink } from "~/lib/telegram";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CopyButton } from "./copy-button";
import { VisibilityBadge } from "./visibility-badge";

interface PubCardProps {
  pub: {
    _id: Id<"pubs">;
    slug: string;
    title?: string;
    isPublic: boolean;
    createdAt: number;
    contentPreview: string;
  };
  viewCount?: number;
  isLive?: boolean;
  onToggleVisibility: (id: Id<"pubs">) => void;
  onDelete: (id: Id<"pubs">) => void;
}

export function PubCard({ pub, viewCount, isLive, onToggleVisibility, onDelete }: PubCardProps) {
  return (
    <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20 group">
      <Link to="/p/$slug" params={{ slug: pub.slug }} className="block">
        <div className="aspect-[1200/630] overflow-hidden bg-white">
          {!pub.contentPreview ? (
            <div className="h-full w-full flex items-center justify-center bg-muted/30">
              <FileText className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            </div>
          ) : (
            <PubPreviewIframe contentPreview={pub.contentPreview} title={pub.title || pub.slug} />
          )}
        </div>
      </Link>
      <CardContent className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/p/$slug"
            params={{ slug: pub.slug }}
            className="font-medium text-sm hover:text-primary transition-colors truncate"
          >
            {pub.title || pub.slug}
          </Link>
          <VisibilityBadge isPublic={pub.isPublic} />
          {isLive && (
            <Badge
              variant="outline"
              className="gap-1 text-emerald-600 border-emerald-600/20 text-xs"
            >
              <Radio className="h-3 w-3 animate-pulse" aria-hidden="true" />
              Live
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          /{pub.slug} &middot; {new Date(pub.createdAt).toLocaleDateString()}
          {viewCount !== undefined && (
            <span className="tabular-nums"> &middot; {viewCount} views</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 pointer-coarse:gap-1.5">
          <CopyButton
            text={`${window.location.origin}/p/${encodeURIComponent(pub.slug)}`}
            onCopy={() => trackPubLinkCopied({ slug: pub.slug })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11"
            onClick={() =>
              telegramOpenLink(`${window.location.origin}/p/${encodeURIComponent(pub.slug)}`)
            }
            aria-label="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11"
            onClick={() => {
              trackVisibilityToggled({
                slug: pub.slug,
                newVisibility: pub.isPublic ? "private" : "public",
              });
              onToggleVisibility(pub._id);
            }}
            aria-label={pub.isPublic ? "Make private" : "Make public"}
          >
            {pub.isPublic ? (
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 text-destructive hover:text-destructive"
            onClick={() => {
              void telegramConfirm("Delete this pub?").then((ok) => {
                if (!ok) return;
                trackPubDeleted({
                  slug: pub.slug,
                });
                onDelete(pub._id);
              });
            }}
            aria-label="Delete pub"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
