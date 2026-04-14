import type { PaginationStatus } from "convex/react";
import type { PubGridItem } from "~/features/pubs/components/pubs-grid";

export type PubsPageState =
  | { kind: "loading" }
  | { kind: "onboarding" }
  | { kind: "empty" }
  | {
      kind: "populated";
      pubs: PubGridItem[];
      canLoadMore: boolean;
      isLoadingMore: boolean;
    };

export function derivePubsPageState(input: {
  status: PaginationStatus;
  pubs: PubGridItem[];
  apiKeysLoaded: boolean;
  hasApiKeys: boolean;
}): PubsPageState {
  const { status, pubs, apiKeysLoaded, hasApiKeys } = input;

  if (status === "LoadingFirstPage" || !apiKeysLoaded) {
    return { kind: "loading" };
  }

  if (pubs.length === 0) {
    return hasApiKeys ? { kind: "empty" } : { kind: "onboarding" };
  }

  return {
    kind: "populated",
    pubs,
    canLoadMore: status === "CanLoadMore",
    isLoadingMore: status === "LoadingMore",
  };
}
