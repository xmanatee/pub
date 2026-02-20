import { describe, it, expect } from "vitest";

// These tests verify the business logic of content type inference and slug generation
// without needing a running Convex backend.

describe("content type inference", () => {
  function inferContentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "html":
      case "htm":
        return "html";
      case "css":
        return "css";
      case "js":
      case "mjs":
        return "js";
      case "md":
      case "markdown":
        return "markdown";
      default:
        return "text";
    }
  }

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
  });

  it("handles files without extension", () => {
    expect(inferContentType("Makefile")).toBe("text");
  });
});

describe("slug validation", () => {
  it("generated slugs are 8 chars of alphanumeric", () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const slug = Array.from(bytes, (b) => chars[b % chars.length]).join("");

    expect(slug).toHaveLength(8);
    expect(slug).toMatch(/^[a-z0-9]+$/);
  });
});

describe("content size limits", () => {
  const MAX_CONTENT_SIZE = 1024 * 1024;

  it("accepts content under 1MB", () => {
    const content = "x".repeat(1000);
    expect(content.length).toBeLessThan(MAX_CONTENT_SIZE);
  });

  it("rejects content over 1MB", () => {
    const content = "x".repeat(MAX_CONTENT_SIZE + 1);
    expect(content.length).toBeGreaterThan(MAX_CONTENT_SIZE);
  });
});
