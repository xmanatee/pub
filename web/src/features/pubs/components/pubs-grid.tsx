import type { Id } from "@backend/_generated/dataModel";
import { PubCardGrid, PubCardSkeletons } from "~/components/pub-card-grid";
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

type PubActionHandler = (pub: PubGridItem) => void | Promise<void>;
type PubCopyLinkHandler = (pub: PubGridItem, pubUrl: string) => void | Promise<void>;

export function PubsGrid({
  pubs,
  liveSlugs,
  pending = 0,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  onCopyLink,
  developerMode,
}: {
  pubs: PubGridItem[];
  liveSlugs: Set<string>;
  pending?: number;
  onToggleVisibility: PubActionHandler;
  onDelete: PubActionHandler;
  onDuplicate?: PubActionHandler;
  onCopyLink: PubCopyLinkHandler;
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
          onCopyLink={onCopyLink}
          developerMode={developerMode}
        />
      ))}
      <PubCardSkeletons count={pending} />
    </PubCardGrid>
  );
}
