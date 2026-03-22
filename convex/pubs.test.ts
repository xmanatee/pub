import { describe, expect, it } from "vitest";
import { buildPubPatch } from "./pubs";

describe("update patch construction", () => {
  it("includes only provided fields plus updatedAt", () => {
    const patch = buildPubPatch({ content: "new" });
    expect(patch.content).toBe("new");
    expect(patch).toHaveProperty("updatedAt");
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("slug");
  });

  it("clears previewHtml when content changes", () => {
    const patch = buildPubPatch({ content: "new" });
    expect(patch.previewHtml).toBeUndefined();
    expect(patch).toHaveProperty("previewHtml");
  });

  it("does not clear previewHtml when only title changes", () => {
    const patch = buildPubPatch({ title: "new title" });
    expect(patch).not.toHaveProperty("previewHtml");
  });

  it("includes all fields when all provided", () => {
    const patch = buildPubPatch({
      content: "c",
      title: "t",
      isPublic: true,
      slug: "s",
    });
    expect(Object.keys(patch).sort()).toEqual(
      ["content", "isPublic", "previewHtml", "slug", "title", "updatedAt"].sort(),
    );
  });

  it("includes slug for rename", () => {
    const patch = buildPubPatch({ slug: "new-slug" });
    expect(patch.slug).toBe("new-slug");
  });
});
