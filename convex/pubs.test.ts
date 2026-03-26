import { describe, expect, it } from "vitest";
import { buildPubPatch } from "./pubs";

describe("update patch construction", () => {
  it("includes only provided fields plus updatedAt", () => {
    const patch = buildPubPatch({ title: "new" });
    expect(patch.title).toBe("new");
    expect(patch).toHaveProperty("updatedAt");
    expect(patch).not.toHaveProperty("slug");
  });

  it("includes all fields when all provided", () => {
    const patch = buildPubPatch({
      title: "t",
      description: "d",
      isPublic: true,
      slug: "s",
    });
    expect(Object.keys(patch).sort()).toEqual(
      ["description", "isPublic", "slug", "title", "updatedAt"].sort(),
    );
  });

  it("includes slug for rename", () => {
    const patch = buildPubPatch({ slug: "new-slug" });
    expect(patch.slug).toBe("new-slug");
  });
});
