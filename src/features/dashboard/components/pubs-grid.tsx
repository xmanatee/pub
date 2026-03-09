import { Button } from "~/components/ui/button";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PubCard } from "./pub-card";

export interface PubGridItem {
  _id: Id<"pubs">;
  slug: string;
  title?: string;
  contentType?: string;
  isPublic: boolean;
  createdAt: number;
  contentPreview: string;
}

export function PubsGrid({
  pubs,
  viewCounts,
  status,
  onLoadMore,
  onToggleVisibility,
  onDelete,
}: {
  pubs: PubGridItem[];
  viewCounts?: Record<string, number>;
  status: "Exhausted" | "CanLoadMore" | "LoadingMore";
  onLoadMore: () => void;
  onToggleVisibility: (id: Id<"pubs">) => void;
  onDelete: (id: Id<"pubs">) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {pubs.map((pub) => (
        <PubCard
          key={pub._id}
          pub={pub}
          viewCount={viewCounts?.[pub.slug]}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
        />
      ))}

      {status === "CanLoadMore" && (
        <div className="col-span-full text-center pt-4">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      )}
      {status === "LoadingMore" && (
        <div className="col-span-full text-center pt-4 text-muted-foreground text-sm">
          Loading more\u2026
        </div>
      )}
    </div>
  );
}
