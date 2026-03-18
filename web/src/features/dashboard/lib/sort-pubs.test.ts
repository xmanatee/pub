import { describe, expect, it } from "vitest";
import { type PubSortKey, SORT_OPTIONS } from "./sort-pubs";

describe("SORT_OPTIONS", () => {
  it("covers all PubSortKey values", () => {
    const keys: PubSortKey[] = ["lastViewed", "lastUpdated", "newest", "oldest", "mostViewed"];
    expect(SORT_OPTIONS.map((o) => o.key)).toEqual(keys);
  });

  it("has unique keys", () => {
    const keys = SORT_OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
