import type { Id } from "@backend/_generated/dataModel";
import { PubCardGrid } from "~/components/pub-card-grid";
import { PubCardSkeleton } from "~/components/pub-card-skeleton";
import { PubCard } from "./pub-card";

export interface PubGridItem {
  _id: Id<"pubs">;
  slug: string;
  title?: string;
  description?: string;
  themeColor?: string;
  iconUrl?: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number;
  viewCount: number;
}

export function PubsGrid({
  pubs,
  liveSlugs,
  pending = 0,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  developerMode,
}: {
  pubs: PubGridItem[];
  liveSlugs: Set<string>;
  pending?: number;
  onToggleVisibility: (id: Id<"pubs">) => void;
  onDelete: (id: Id<"pubs">) => void;
  onDuplicate?: (id: Id<"pubs">) => void;
  developerMode?: boolean;
}) {
  return (
    <PubCardGrid>
      {pubs.map((pub) => (
        <PubCard
          key={pub._id}
          pub={pub}
          isLive={liveSlugs.has(pub.slug)}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          developerMode={developerMode}
        />
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <PubCardSkeleton key={`pending-${i}`} />
      ))}
    </PubCardGrid>
  );
}
