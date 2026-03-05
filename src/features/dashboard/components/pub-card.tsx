import { Clock, ExternalLink, FileText, Globe, Lock, Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { trackPubDeleted, trackPubLinkCopied, trackVisibilityToggled } from "~/lib/analytics";
import { buildHtmlSrcdoc, buildTextSrcdoc, formatRelativeTime } from "~/lib/pub-preview";
import { telegramConfirm } from "~/lib/telegram";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CopyButton } from "./copy-button";
import { VisibilityBadge } from "./visibility-badge";

interface PubCardProps {
  pub: {
    _id: Id<"pubs">;
    slug: string;
    contentType?: string;
    title?: string;
    isPublic: boolean;
    expiresAt?: number;
    createdAt: number;
    contentPreview: string;
  };
  viewCount?: number;
  onToggleVisibility: (id: Id<"pubs">) => void;
  onDelete: (id: Id<"pubs">) => void;
}

function PreviewIframe({ pub }: { pub: PubCardProps["pub"] }) {
  if (!pub.contentPreview && !pub.contentType) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <FileText className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      </div>
    );
  }

  if (pub.contentType === "html") {
    return (
      <iframe
        srcDoc={buildHtmlSrcdoc(pub.contentPreview)}
        sandbox=""
        loading="lazy"
        tabIndex={-1}
        title={pub.title || pub.slug}
        className="h-full w-full border-none pointer-events-none"
      />
    );
  }

  return (
    <iframe
      srcDoc={buildTextSrcdoc(pub.contentPreview, pub.contentType ?? "text")}
      sandbox=""
      loading="lazy"
      tabIndex={-1}
      title={pub.title || pub.slug}
      className="h-full w-full border-none pointer-events-none"
    />
  );
}

export function PubCard({ pub, viewCount, onToggleVisibility, onDelete }: PubCardProps) {
  return (
    <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20 group">
      <a href={`/p/${pub.slug}`} className="block">
        <div className="aspect-[1200/630] overflow-hidden bg-white">
          <PreviewIframe pub={pub} />
        </div>
      </a>
      <CardContent className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/p/${pub.slug}`}
            className="font-medium text-sm hover:text-primary transition-colors truncate"
          >
            {pub.title || pub.slug}
          </a>
          {pub.contentType && (
            <Badge variant="secondary" className="text-xs">
              {pub.contentType}
            </Badge>
          )}
          <VisibilityBadge isPublic={pub.isPublic} />
          {pub.expiresAt && (
            <Badge variant="outline" className="gap-1 text-orange-600 border-orange-600/20 text-xs">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatRelativeTime(pub.expiresAt)}
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
            asChild
          >
            <a
              href={`/p/${encodeURIComponent(pub.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
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
                  contentType: pub.contentType ?? "text",
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
