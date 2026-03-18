import { describe, expect, it } from "vitest";
import type { PubGridItem } from "../components/pubs-grid";
import { type PubSortKey, SORT_OPTIONS, sortPubs } from "./sort-pubs";

function makePub(overrides: Partial<PubGridItem> & Pick<PubGridItem, "slug">): PubGridItem {
  const { slug, ...rest } = overrides;
  return {
    _id: "" as never,
    slug,
    isPublic: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...rest,
  };
}

const pubs: PubGridItem[] = [
  makePub({
    slug: "alpha",
    createdAt: 100,
    updatedAt: 300,
    lastViewedAt: 500,
    contentSize: 1,
  }),
  makePub({
    slug: "beta",
    createdAt: 200,
    updatedAt: 100,
    lastViewedAt: 200,
    contentSize: 3,
  }),
  makePub({
    slug: "gamma",
    createdAt: 300,
    updatedAt: 200,
    contentSize: 2,
  }),
];

const viewCounts: Record<string, number> = {
  alpha: 10,
  beta: 50,
  gamma: 30,
};

function slugs(sorted: PubGridItem[]) {
  return sorted.map((p) => p.slug);
}

describe("sortPubs", () => {
  it("sorts by lastViewed desc, falling back to createdAt", () => {
    const result = sortPubs(pubs, "lastViewed");
    expect(slugs(result)).toEqual(["alpha", "gamma", "beta"]);
  });

  it("sorts by lastUpdated desc", () => {
    const result = sortPubs(pubs, "lastUpdated");
    expect(slugs(result)).toEqual(["alpha", "gamma", "beta"]);
  });

  it("sorts by newest (createdAt desc)", () => {
    const result = sortPubs(pubs, "newest");
    expect(slugs(result)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("sorts by oldest (createdAt asc)", () => {
    const result = sortPubs(pubs, "oldest");
    expect(slugs(result)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sorts by content size desc", () => {
    const result = sortPubs(pubs, "size");
    expect(slugs(result)).toEqual(["beta", "gamma", "alpha"]);
  });

  it("sorts by most viewed desc", () => {
    const result = sortPubs(pubs, "mostViewed", viewCounts);
    expect(slugs(result)).toEqual(["beta", "gamma", "alpha"]);
  });

  it("treats missing viewCounts as 0", () => {
    const result = sortPubs(pubs, "mostViewed");
    expect(slugs(result)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("treats missing content as 0 size", () => {
    const noPubs = [makePub({ slug: "empty" }), makePub({ slug: "has", contentSize: 1 })];
    const result = sortPubs(noPubs, "size");
    expect(slugs(result)).toEqual(["has", "empty"]);
  });

  it("does not mutate the input array", () => {
    const input = [...pubs];
    sortPubs(input, "newest");
    expect(slugs(input)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("returns empty array for empty input", () => {
    expect(sortPubs([], "newest")).toEqual([]);
  });
});

describe("SORT_OPTIONS", () => {
  it("covers all PubSortKey values", () => {
    const keys: PubSortKey[] = [
      "lastViewed",
      "lastUpdated",
      "newest",
      "oldest",
      "size",
      "mostViewed",
    ];
    expect(SORT_OPTIONS.map((o) => o.key)).toEqual(keys);
  });

  it("has unique keys", () => {
    const keys = SORT_OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
