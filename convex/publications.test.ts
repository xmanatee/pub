import { describe, expect, it } from "vitest";
import { buildPublicationPatch, isVisibilityEscalation } from "./publications";
import { inferContentType } from "./utils";

describe("update patch construction", () => {
  it("includes only provided fields plus updatedAt", () => {
    const patch = buildPublicationPatch({ content: "new" });
    expect(patch.content).toBe("new");
    expect(patch).toHaveProperty("updatedAt");
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("slug");
  });

  it("includes all fields when all provided", () => {
    const patch = buildPublicationPatch({
      content: "c",
      contentType: "html",
      title: "t",
      isPublic: true,
      slug: "s",
    });
    expect(Object.keys(patch).sort()).toEqual(
      ["content", "contentType", "isPublic", "slug", "title", "updatedAt"].sort(),
    );
  });

  it("includes slug for rename", () => {
    const patch = buildPublicationPatch({ slug: "new-slug" });
    expect(patch.slug).toBe("new-slug");
  });
});

describe("visibility escalation guard", () => {
  it("detects private to public changes", () => {
    expect(isVisibilityEscalation(false, true)).toBe(true);
  });

  it("does not flag unchanged or non-public transitions", () => {
    expect(isVisibilityEscalation(true, true)).toBe(false);
    expect(isVisibilityEscalation(true, false)).toBe(false);
    expect(isVisibilityEscalation(false, false)).toBe(false);
    expect(isVisibilityEscalation(false, undefined)).toBe(false);
  });
});

describe("content type inference for update", () => {
  it("infers new contentType from filename hint", () => {
    const pub = { contentType: "html" };
    const filename = "new.md";
    const contentType = filename ? inferContentType(filename) : undefined;
    expect(contentType ?? pub.contentType).toBe("markdown");
  });

  it("keeps existing contentType when no filename", () => {
    const pub = { contentType: "html" };
    const filename = undefined;
    const contentType = filename ? inferContentType(filename) : undefined;
    expect(contentType ?? pub.contentType).toBe("html");
  });
});
