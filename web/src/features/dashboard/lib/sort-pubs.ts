import type { PubGridItem } from "../components/pubs-grid";

export type PubSortKey = "lastViewed" | "lastUpdated" | "newest" | "oldest" | "size" | "mostViewed";

export const SORT_OPTIONS: { key: PubSortKey; label: string }[] = [
  { key: "lastViewed", label: "Last viewed" },
  { key: "lastUpdated", label: "Last updated" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "size", label: "Size" },
  { key: "mostViewed", label: "Most viewed" },
];

function comparePubs(
  a: PubGridItem,
  b: PubGridItem,
  sortKey: PubSortKey,
  viewCounts?: Record<string, number>,
): number {
  switch (sortKey) {
    case "lastViewed":
      return (b.lastViewedAt ?? b.createdAt) - (a.lastViewedAt ?? a.createdAt);
    case "lastUpdated":
      return b.updatedAt - a.updatedAt;
    case "newest":
      return b.createdAt - a.createdAt;
    case "oldest":
      return a.createdAt - b.createdAt;
    case "size":
      return (b.contentSize ?? 0) - (a.contentSize ?? 0);
    case "mostViewed":
      return (viewCounts?.[b.slug] ?? 0) - (viewCounts?.[a.slug] ?? 0);
  }
}

export function sortPubs(
  pubs: PubGridItem[],
  sortKey: PubSortKey,
  viewCounts?: Record<string, number>,
): PubGridItem[] {
  const sorted = [...pubs];
  sorted.sort((a, b) => comparePubs(a, b, sortKey, viewCounts));
  return sorted;
}
