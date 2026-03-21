import type { Id } from "@backend/_generated/dataModel";
import { PubCard } from "./pub-card";

export interface PubGridItem {
  _id: Id<"pubs">;
  slug: string;
  previewHtml?: string;
  title?: string;
  description?: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number;
  viewCount: number;
}

export function PubsGrid({
  pubs,
  liveSlugs,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  developerMode,
}: {
  pubs: PubGridItem[];
  liveSlugs: Set<string>;
  onToggleVisibility: (id: Id<"pubs">) => void;
  onDelete: (id: Id<"pubs">) => void;
  onDuplicate?: (id: Id<"pubs">) => void;
  developerMode?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
    </div>
  );
}
