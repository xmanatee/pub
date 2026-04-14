import { describe, expect, it } from "vitest";
import type { Id } from "@backend/_generated/dataModel";
import type { PubGridItem } from "~/features/pubs/components/pubs-grid";
import { derivePubsPageState } from "./pubs-page-state";

const pub: PubGridItem = {
  _id: "p1" as Id<"pubs">,
  slug: "demo",
  isPublic: true,
  createdAt: 0,
  updatedAt: 0,
  viewCount: 0,
};

describe("derivePubsPageState", () => {
  it("is loading while the api-keys query has not resolved, regardless of pubs status", () => {
    expect(
      derivePubsPageState({
        status: "Exhausted",
        pubs: [pub],
        apiKeysLoaded: false,
        hasApiKeys: false,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("is loading during LoadingFirstPage — both initial fetch and sort-change refetch (never empty/onboarding)", () => {
    expect(
      derivePubsPageState({
        status: "LoadingFirstPage",
        pubs: [],
        apiKeysLoaded: true,
        hasApiKeys: true,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("is onboarding when the user has no pubs and no api keys", () => {
    expect(
      derivePubsPageState({
        status: "Exhausted",
        pubs: [],
        apiKeysLoaded: true,
        hasApiKeys: false,
      }),
    ).toEqual({ kind: "onboarding" });
  });

  it("is empty when the user has api keys but no pubs", () => {
    expect(
      derivePubsPageState({
        status: "Exhausted",
        pubs: [],
        apiKeysLoaded: true,
        hasApiKeys: true,
      }),
    ).toEqual({ kind: "empty" });
  });

  it("is populated with canLoadMore when more pages are available", () => {
    expect(
      derivePubsPageState({
        status: "CanLoadMore",
        pubs: [pub],
        apiKeysLoaded: true,
        hasApiKeys: true,
      }),
    ).toEqual({ kind: "populated", pubs: [pub], canLoadMore: true, isLoadingMore: false });
  });

  it("is populated with isLoadingMore during incremental pagination", () => {
    expect(
      derivePubsPageState({
        status: "LoadingMore",
        pubs: [pub],
        apiKeysLoaded: true,
        hasApiKeys: true,
      }),
    ).toEqual({ kind: "populated", pubs: [pub], canLoadMore: false, isLoadingMore: true });
  });

  it("is populated with both flags false when pagination is exhausted", () => {
    expect(
      derivePubsPageState({
        status: "Exhausted",
        pubs: [pub],
        apiKeysLoaded: true,
        hasApiKeys: true,
      }),
    ).toEqual({ kind: "populated", pubs: [pub], canLoadMore: false, isLoadingMore: false });
  });
});
