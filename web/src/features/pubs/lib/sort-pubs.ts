export type PubSortKey = "lastViewed" | "lastUpdated" | "newest" | "oldest" | "mostViewed";

export const SORT_OPTIONS: { key: PubSortKey; label: string }[] = [
  { key: "lastViewed", label: "Last viewed" },
  { key: "lastUpdated", label: "Last updated" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "mostViewed", label: "Most viewed" },
];
