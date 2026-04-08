import type { Id } from "@backend/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import {
  Code,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Lock,
  MoreVertical,
  Radio,
  Trash2,
} from "lucide-react";
import { PubPreviewCard } from "~/components/pub-preview-card";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { PubGridItem } from "~/features/pubs/components/pubs-grid";
import { trackPubDeleted, trackPubLinkCopied, trackVisibilityToggled } from "~/lib/analytics";
import { telegramConfirm, telegramOpenLink } from "~/lib/telegram";

interface PubCardProps {
  pub: PubGridItem;
  isLive?: boolean;
  onToggleVisibility: (id: Id<"pubs">) => void;
  onDelete: (id: Id<"pubs">) => void;
  onDuplicate?: (id: Id<"pubs">) => void;
  developerMode?: boolean;
}

export function PubCard({
  pub,
  isLive,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  developerMode,
}: PubCardProps) {
  const pubUrl = `${window.location.origin}/p/${encodeURIComponent(pub.slug)}`;

  return (
    <Card className="overflow-hidden border-border/50 transition-colors hover:border-primary/20 group">
      <Link to="/p/$slug" params={{ slug: pub.slug }} className="block">
        <div className="aspect-[1200/430] overflow-hidden">
          <PubPreviewCard
            slug={pub.slug}
            title={pub.title}
            description={pub.description}
            themeColor={pub.themeColor}
            iconUrl={pub.iconUrl}
          />
        </div>
      </Link>
      <CardContent className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 flex-1 min-w-0 text-xs text-muted-foreground">
            {pub.isPublic ? (
              <Globe className="h-3 w-3 text-emerald-600 shrink-0" aria-label="Public" />
            ) : (
              <Lock className="h-3 w-3 text-amber-600 shrink-0" aria-label="Private" />
            )}
            <span>{new Date(pub.createdAt).toLocaleDateString()}</span>
            {pub.viewCount > 0 && (
              <>
                <span className="text-border">&middot;</span>
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  {pub.viewCount}
                </span>
              </>
            )}
            {isLive && (
              <Radio
                className="h-3.5 w-3.5 text-emerald-500 animate-pulse shrink-0"
                aria-label="Live"
              />
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pubUrl);
                    trackPubLinkCopied({ slug: pub.slug });
                  } catch (error) {
                    console.error("Failed to copy", error);
                  }
                }}
              >
                <Copy />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => telegramOpenLink(pubUrl)}>
                <ExternalLink />
                Open in new tab
              </DropdownMenuItem>
              {developerMode && (
                <DropdownMenuItem asChild>
                  <Link to="/p/$slug" params={{ slug: pub.slug }} search={{ source: true }}>
                    <Code />
                    View source
                  </Link>
                </DropdownMenuItem>
              )}
              {developerMode && onDuplicate && (
                <DropdownMenuItem onClick={() => onDuplicate(pub._id)}>
                  <Copy />
                  Duplicate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  trackVisibilityToggled({
                    slug: pub.slug,
                    newVisibility: pub.isPublic ? "private" : "public",
                  });
                  onToggleVisibility(pub._id);
                }}
              >
                {pub.isPublic ? <Lock /> : <Globe />}
                {pub.isPublic ? "Make private" : "Make public"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  void telegramConfirm("Delete this pub?").then((ok) => {
                    if (!ok) return;
                    trackPubDeleted({ slug: pub.slug });
                    onDelete(pub._id);
                  });
                }}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
