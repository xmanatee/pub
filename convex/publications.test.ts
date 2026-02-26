import { describe, expect, it } from "vitest";
import { inferContentType } from "./utils";

describe("update patch construction", () => {
  function buildPatch(fields: {
    content?: string;
    contentType?: string;
    title?: string;
    isPublic?: boolean;
    slug?: string;
  }) {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.content !== undefined) patch.content = fields.content;
    if (fields.contentType !== undefined) patch.contentType = fields.contentType;
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.isPublic !== undefined) patch.isPublic = fields.isPublic;
    if (fields.slug !== undefined) patch.slug = fields.slug;
    return patch;
  }

  it("includes only provided fields plus updatedAt", () => {
    const patch = buildPatch({ content: "new" });
    expect(patch.content).toBe("new");
    expect(patch).toHaveProperty("updatedAt");
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("slug");
  });

  it("includes all fields when all provided", () => {
    const patch = buildPatch({
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
    const patch = buildPatch({ slug: "new-slug" });
    expect(patch.slug).toBe("new-slug");
  });
});

describe("private publication access control", () => {
  function canAccess(pub: { isPublic: boolean; userId: string }, currentUserId: string | null) {
    return pub.isPublic || (currentUserId !== null && pub.userId === currentUserId);
  }

  it("allows owner to see private publication", () => {
    expect(canAccess({ isPublic: false, userId: "u1" }, "u1")).toBe(true);
  });

  it("denies non-owner from seeing private publication", () => {
    expect(canAccess({ isPublic: false, userId: "u1" }, "u2")).toBe(false);
  });

  it("allows anyone to see public publication", () => {
    expect(canAccess({ isPublic: true, userId: "u1" }, null)).toBe(true);
  });

  it("denies unauthenticated users from private publications", () => {
    expect(canAccess({ isPublic: false, userId: "u1" }, null)).toBe(false);
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
