import type { Id } from "@backend/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { ExternalLink, FileText, Globe, Lock, Radio, Trash2 } from "lucide-react";
import { PubPreviewIframe } from "~/components/pub-preview-iframe";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { trackPubDeleted, trackPubLinkCopied, trackVisibilityToggled } from "~/lib/analytics";
import { telegramConfirm, telegramOpenLink } from "~/lib/telegram";
import { CopyButton } from "./copy-button";
import type { PubGridItem } from "./pubs-grid";
import { VisibilityBadge } from "./visibility-badge";

interface PubCardProps {
  pub: PubGridItem;
  isLive?: boolean;
  snapshot?: string;
  onToggleVisibility: (id: Id<"pubs">) => void;
  onDelete: (id: Id<"pubs">) => void;
  onSnapshot?: (slug: string, html: string) => void;
}

export function PubCard({
  pub,
  isLive,
  snapshot,
  onToggleVisibility,
  onDelete,
  onSnapshot,
}: PubCardProps) {
  const canPreview = snapshot || (pub.isPublic && pub.hasContent);
  return (
    <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20 group">
      <Link to="/p/$slug" params={{ slug: pub.slug }} className="block">
        <div className="aspect-[1200/630] overflow-hidden bg-white relative">
          {!canPreview ? (
            <div className="h-full w-full flex items-center justify-center bg-muted/30">
              <FileText className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            </div>
          ) : (
            <PubPreviewIframe
              slug={pub.slug}
              title={pub.title || pub.slug}
              snapshot={snapshot}
              onSnapshot={onSnapshot}
            />
          )}
          {pub.description && (
            <div className="absolute inset-0 flex items-end bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="px-3 py-2 text-xs text-white leading-snug">{pub.description}</p>
            </div>
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
          {new Date(pub.createdAt).toLocaleDateString()}
          {pub.viewCount > 0 && (
            <span className="tabular-nums"> &middot; {pub.viewCount} views</span>
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
