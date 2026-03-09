import { describe, expect, it, vi } from "vitest";
import {
  escapeHtmlAttr,
  escapeXml,
  generateApiKey,
  generateSlug,
  hashApiKey,
  inferContentType,
  isValidSlug,
  keyPreviewFromKey,
  MAX_CONTENT_SIZE,
  MAX_KEY_NAME_LENGTH,
  MAX_PUBS,
  MAX_TITLE_LENGTH,
  SLUG_PATTERN,
  truncate,
} from "./utils";

describe("inferContentType", () => {
  it("infers HTML from .html and .htm", () => {
    expect(inferContentType("page.html")).toBe("html");
    expect(inferContentType("page.htm")).toBe("html");
  });

  it("infers Markdown from .md and .markdown", () => {
    expect(inferContentType("readme.md")).toBe("markdown");
    expect(inferContentType("doc.markdown")).toBe("markdown");
  });

  it("defaults to text for other extensions", () => {
    expect(inferContentType("styles.css")).toBe("text");
    expect(inferContentType("script.js")).toBe("text");
    expect(inferContentType("data.json")).toBe("text");
    expect(inferContentType("file.txt")).toBe("text");
  });

  it("handles case-insensitive extensions", () => {
    expect(inferContentType("page.HTML")).toBe("html");
    expect(inferContentType("readme.MD")).toBe("markdown");
  });

  it("handles files with multiple dots", () => {
    expect(inferContentType("my.page.html")).toBe("html");
    expect(inferContentType("bundle.min.js")).toBe("text");
  });

  it("handles edge cases", () => {
    expect(inferContentType("")).toBe("text");
    expect(inferContentType("Makefile")).toBe("text");
    expect(inferContentType(".gitignore")).toBe("text");
  });
});

describe("generateSlug", () => {
  it("generates 8-character lowercase alphanumeric slugs", () => {
    for (let i = 0; i < 20; i++) {
      const slug = generateSlug();
      expect(slug).toHaveLength(8);
      expect(slug).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("generates unique slugs", () => {
    const slugs = new Set(Array.from({ length: 50 }, () => generateSlug()));
    expect(slugs.size).toBe(50);
  });

  it("uses crypto.getRandomValues", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    generateSlug();
    expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));
    spy.mockRestore();
  });
});

describe("generateApiKey", () => {
  it("generates keys with pub_ prefix and 48 hex chars", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^pub_[0-9a-f]{48}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()));
    expect(keys.size).toBe(20);
  });
});

describe("keyPreviewFromKey", () => {
  it("shows first 8 and last 4 chars", () => {
    const preview = keyPreviewFromKey("pub_abcdef1234567890abcdef");
    expect(preview).toBe("pub_abcd...cdef");
  });

  it("generates valid previews from real keys", () => {
    const key = generateApiKey();
    const preview = keyPreviewFromKey(key);
    expect(preview).toMatch(/^pub_.{4}\.\.\..{4}$/);
  });
});

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("hello")).toBe(true);
    expect(isValidSlug("my-slug")).toBe(true);
    expect(isValidSlug("slug_123")).toBe(true);
    expect(isValidSlug("a.b.c")).toBe(true);
    expect(isValidSlug("A")).toBe(true);
    expect(isValidSlug("0abc")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-start")).toBe(false);
    expect(isValidSlug(".start")).toBe(false);
    expect(isValidSlug("_start")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("a".repeat(65))).toBe(false);
  });

  it("accepts max-length slug (64 chars)", () => {
    expect(isValidSlug("a".repeat(64))).toBe(true);
  });
});

describe("hashApiKey", () => {
  it("produces consistent SHA-256 hex hash", async () => {
    const hash1 = await hashApiKey("test-key");
    const hash2 = await hashApiKey("test-key");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", async () => {
    const hash1 = await hashApiKey("key-1");
    const hash2 = await hashApiKey("key-2");
    expect(hash1).not.toBe(hash2);
  });
});

describe("escapeXml", () => {
  it("escapes all XML special characters", () => {
    expect(escapeXml("&")).toBe("&amp;");
    expect(escapeXml("<")).toBe("&lt;");
    expect(escapeXml(">")).toBe("&gt;");
    expect(escapeXml('"')).toBe("&quot;");
    expect(escapeXml("'")).toBe("&apos;");
  });

  it("escapes mixed content", () => {
    expect(escapeXml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("preserves safe strings", () => {
    expect(escapeXml("Hello World 123")).toBe("Hello World 123");
  });
});

describe("escapeHtmlAttr", () => {
  it("escapes attribute-unsafe characters", () => {
    expect(escapeHtmlAttr('"quoted"')).toBe("&quot;quoted&quot;");
    expect(escapeHtmlAttr("<tag>")).toBe("&lt;tag&gt;");
    expect(escapeHtmlAttr("a&b")).toBe("a&amp;b");
  });

  it("handles XSS payloads in OG tags", () => {
    const malicious = '"><script>alert(1)</script>';
    const escaped = escapeHtmlAttr(malicious);
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("<script>");
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("exact", 5)).toBe("exact");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("a very long string", 10)).toBe("a very lo…");
    expect(truncate("abcdef", 4)).toBe("abc…");
  });

  it("handles edge cases", () => {
    expect(truncate("", 5)).toBe("");
    expect(truncate("ab", 1)).toBe("…");
  });
});

describe("constants", () => {
  it("limits are reasonable", () => {
    expect(MAX_CONTENT_SIZE).toBe(100 * 1024);
    expect(MAX_TITLE_LENGTH).toBe(256);
    expect(MAX_KEY_NAME_LENGTH).toBe(128);
    expect(MAX_PUBS).toBe(10);
  });

  it("SLUG_PATTERN matches valid patterns", () => {
    expect(SLUG_PATTERN.test("abc")).toBe(true);
    expect(SLUG_PATTERN.test("a-b_c.d")).toBe(true);
    expect(SLUG_PATTERN.test("-invalid")).toBe(false);
  });
});
