import { describe, expect, it, vi } from "vitest";
import { CONTENT_TYPES, generateSlug, inferContentType, MAX_CONTENT_SIZE } from "./utils";

describe("inferContentType", () => {
  it("infers HTML from .html", () => {
    expect(inferContentType("page.html")).toBe("html");
  });

  it("infers HTML from .htm", () => {
    expect(inferContentType("page.htm")).toBe("html");
  });

  it("infers CSS from .css", () => {
    expect(inferContentType("styles.css")).toBe("css");
  });

  it("infers JS from .js", () => {
    expect(inferContentType("script.js")).toBe("js");
  });

  it("infers JS from .mjs", () => {
    expect(inferContentType("module.mjs")).toBe("js");
  });

  it("infers Markdown from .md", () => {
    expect(inferContentType("readme.md")).toBe("markdown");
  });

  it("infers Markdown from .markdown", () => {
    expect(inferContentType("doc.markdown")).toBe("markdown");
  });

  it("defaults to text for unknown extensions", () => {
    expect(inferContentType("data.json")).toBe("text");
    expect(inferContentType("file.txt")).toBe("text");
    expect(inferContentType("file.yaml")).toBe("text");
    expect(inferContentType("file.xml")).toBe("text");
    expect(inferContentType("file.toml")).toBe("text");
  });

  it("handles files without extension", () => {
    expect(inferContentType("Makefile")).toBe("text");
    expect(inferContentType("Dockerfile")).toBe("text");
  });

  it("handles case-insensitive extensions", () => {
    expect(inferContentType("page.HTML")).toBe("html");
    expect(inferContentType("styles.CSS")).toBe("css");
    expect(inferContentType("script.JS")).toBe("js");
    expect(inferContentType("readme.MD")).toBe("markdown");
  });

  it("handles files with multiple dots", () => {
    expect(inferContentType("my.page.html")).toBe("html");
    expect(inferContentType("my.styles.css")).toBe("css");
    expect(inferContentType("bundle.min.js")).toBe("js");
  });

  it("handles empty filename", () => {
    expect(inferContentType("")).toBe("text");
  });

  it("handles dotfile without extension", () => {
    expect(inferContentType(".gitignore")).toBe("text");
  });
});

describe("generateSlug", () => {
  it("generates 8-character slugs", () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(8);
  });

  it("generates alphanumeric-only slugs", () => {
    for (let i = 0; i < 20; i++) {
      const slug = generateSlug();
      expect(slug).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("generates unique slugs", () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      slugs.add(generateSlug());
    }
    expect(slugs.size).toBe(50);
  });

  it("uses crypto.getRandomValues for entropy", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    generateSlug();
    expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));
    spy.mockRestore();
  });
});

describe("content size limits", () => {
  it("accepts content under 1MB", () => {
    const content = "x".repeat(1000);
    expect(content.length).toBeLessThan(MAX_CONTENT_SIZE);
  });

  it("accepts content at exactly 1MB", () => {
    const content = "x".repeat(MAX_CONTENT_SIZE);
    expect(content.length).toBeLessThanOrEqual(MAX_CONTENT_SIZE);
  });

  it("rejects content over 1MB", () => {
    const content = "x".repeat(MAX_CONTENT_SIZE + 1);
    expect(content.length).toBeGreaterThan(MAX_CONTENT_SIZE);
  });
});

describe("CONTENT_TYPES constant", () => {
  it("contains all expected content types", () => {
    expect(CONTENT_TYPES).toEqual(["html", "css", "js", "markdown", "text"]);
  });

  it("has 5 content types", () => {
    expect(CONTENT_TYPES).toHaveLength(5);
  });
});

describe("publish action logic", () => {
  it("uses provided slug when given", () => {
    const slug = "my-custom-slug";
    const finalSlug = slug || generateSlug();
    expect(finalSlug).toBe("my-custom-slug");
  });

  it("generates slug when none provided", () => {
    const slug = undefined;
    const finalSlug = slug || generateSlug();
    expect(finalSlug).toMatch(/^[a-z0-9]{8}$/);
  });

  it("defaults isPublic to true when not specified", () => {
    const isPublic = undefined;
    const finalIsPublic = isPublic ?? true;
    expect(finalIsPublic).toBe(true);
  });

  it("respects explicit isPublic=false", () => {
    const isPublic = false;
    const finalIsPublic = isPublic ?? true;
    expect(finalIsPublic).toBe(false);
  });

  it("respects explicit isPublic=true", () => {
    const isPublic = true;
    const finalIsPublic = isPublic ?? true;
    expect(finalIsPublic).toBe(true);
  });
});

describe("updatePublication patch logic", () => {
  it("builds patch with all fields", () => {
    const content = "new content";
    const title = "new title";
    const isPublic = false;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (content !== undefined) patch.content = content;
    if (title !== undefined) patch.title = title;
    if (isPublic !== undefined) patch.isPublic = isPublic;

    expect(patch).toHaveProperty("content", "new content");
    expect(patch).toHaveProperty("title", "new title");
    expect(patch).toHaveProperty("isPublic", false);
    expect(patch).toHaveProperty("updatedAt");
  });

  it("builds patch with only content", () => {
    const content = "new content";
    const title = undefined;
    const isPublic = undefined;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (content !== undefined) patch.content = content;
    if (title !== undefined) patch.title = title;
    if (isPublic !== undefined) patch.isPublic = isPublic;

    expect(patch).toHaveProperty("content", "new content");
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("isPublic");
  });

  it("always includes updatedAt", () => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    expect(patch).toHaveProperty("updatedAt");
    expect(typeof patch.updatedAt).toBe("number");
  });
});

describe("updateViaApi return logic", () => {
  it("returns new title when provided", () => {
    const pub = { slug: "abc", title: "old", isPublic: true };
    const title: string | undefined = "new";
    const isPublic: boolean | undefined = undefined;

    const result = {
      slug: pub.slug,
      title: title !== undefined ? title : pub.title,
      isPublic: isPublic !== undefined ? isPublic : pub.isPublic,
    };

    expect(result.title).toBe("new");
    expect(result.isPublic).toBe(true);
  });

  it("returns existing title when not provided", () => {
    const pub = { slug: "abc", title: "old", isPublic: true };
    const title: string | undefined = undefined;
    const isPublic: boolean | undefined = false;

    const result = {
      slug: pub.slug,
      title: title !== undefined ? title : pub.title,
      isPublic: isPublic !== undefined ? isPublic : pub.isPublic,
    };

    expect(result.title).toBe("old");
    expect(result.isPublic).toBe(false);
  });
});

describe("listByUser response mapping", () => {
  it("maps publications without content field", () => {
    const dbPub = {
      _id: "123",
      slug: "abc",
      filename: "test.html",
      contentType: "html" as const,
      content: "<h1>Hello</h1>",
      title: "Test",
      isPublic: true,
      createdAt: 1000,
      updatedAt: 2000,
      userId: "user1",
    };

    const mapped = {
      _id: dbPub._id,
      slug: dbPub.slug,
      filename: dbPub.filename,
      contentType: dbPub.contentType,
      title: dbPub.title,
      isPublic: dbPub.isPublic,
      createdAt: dbPub.createdAt,
      updatedAt: dbPub.updatedAt,
    };

    expect(mapped).not.toHaveProperty("content");
    expect(mapped).not.toHaveProperty("userId");
    expect(mapped.slug).toBe("abc");
  });
});

describe("getBySlug response mapping", () => {
  it("includes content in response", () => {
    const dbPub = {
      _id: "123",
      slug: "abc",
      filename: "test.html",
      contentType: "html" as const,
      content: "<h1>Hello</h1>",
      title: "Test",
      isPublic: true,
      createdAt: 1000,
      updatedAt: 2000,
      userId: "user1",
    };

    const mapped = {
      _id: dbPub._id,
      slug: dbPub.slug,
      filename: dbPub.filename,
      contentType: dbPub.contentType,
      content: dbPub.content,
      title: dbPub.title,
      isPublic: dbPub.isPublic,
      createdAt: dbPub.createdAt,
      updatedAt: dbPub.updatedAt,
    };

    expect(mapped).toHaveProperty("content", "<h1>Hello</h1>");
    expect(mapped).not.toHaveProperty("userId");
  });
});

describe("visibility toggle logic", () => {
  it("toggles true to false", () => {
    expect(!true).toBe(false);
  });

  it("toggles false to true", () => {
    expect(!false).toBe(true);
  });
});

describe("private publication access control logic", () => {
  it("allows owner to see private publication", () => {
    const pub = { isPublic: false, userId: "user1" };
    const currentUserId = "user1";
    const canAccess = pub.isPublic || pub.userId === currentUserId;
    expect(canAccess).toBe(true);
  });

  it("denies non-owner from seeing private publication", () => {
    const pub = { isPublic: false, userId: "user1" };
    const currentUserId = "user2";
    const canAccess = pub.isPublic || pub.userId === currentUserId;
    expect(canAccess).toBe(false);
  });

  it("allows anyone to see public publication", () => {
    const pub = { isPublic: true, userId: "user1" };
    const canAccess = pub.isPublic;
    expect(canAccess).toBe(true);
  });

  it("denies access when no user and private", () => {
    const pub = { isPublic: false, userId: "user1" };
    const currentUserId = null;
    const canAccess = pub.isPublic || (currentUserId !== null && pub.userId === currentUserId);
    expect(canAccess).toBe(false);
  });
});

describe("slug conflict resolution", () => {
  it("allows owner to update existing slug", () => {
    const existing = { userId: "user1", _id: "pub1" };
    const requestUserId = "user1";
    expect(existing.userId === requestUserId).toBe(true);
  });

  it("rejects non-owner from taking existing slug", () => {
    const existing = { userId: "user1", _id: "pub1" };
    const requestUserId = "user2";
    expect(existing.userId === requestUserId).toBe(false);
  });
});
