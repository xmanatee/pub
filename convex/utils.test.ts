import { describe, expect, it, vi } from "vitest";
import {
  escapeHtmlAttr,
  escapeXml,
  extractOgMeta,
  generateApiKey,
  generateSlug,
  hashApiKey,
  hasOgTag,
  isValidSlug,
  keyPreviewFromKey,
  MAX_DESCRIPTION_LENGTH,
  MAX_FILE_SIZE,
  MAX_KEY_NAME_LENGTH,
  MAX_PUBS,
  MAX_PUBS_SUBSCRIBED,
  MAX_TITLE_LENGTH,
  SLUG_PATTERN,
  truncate,
} from "./utils";

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

describe("extractOgMeta", () => {
  it("extracts og:title and og:description", () => {
    const html = `<html><head>
      <meta property="og:title" content="My Title">
      <meta property="og:description" content="My description">
    </head><body></body></html>`;
    expect(extractOgMeta(html)).toEqual({ title: "My Title", description: "My description" });
  });

  it("falls back to <title> when no og:title", () => {
    const html = "<html><head><title>Page Title</title></head><body></body></html>";
    expect(extractOgMeta(html)).toEqual({ title: "Page Title" });
  });

  it("falls back to meta name=description when no og:description", () => {
    const html = '<html><head><meta name="description" content="Fallback desc"></head></html>';
    expect(extractOgMeta(html)).toEqual({ description: "Fallback desc" });
  });

  it("prefers og:title over <title>", () => {
    const html = `<head>
      <title>Fallback</title>
      <meta property="og:title" content="OG Title">
    </head>`;
    expect(extractOgMeta(html).title).toBe("OG Title");
  });

  it("prefers og:description over meta name=description", () => {
    const html = `<head>
      <meta name="description" content="Fallback">
      <meta property="og:description" content="OG Desc">
    </head>`;
    expect(extractOgMeta(html).description).toBe("OG Desc");
  });

  it("handles content attribute before property attribute", () => {
    const html = '<meta content="Reversed Title" property="og:title">';
    expect(extractOgMeta(html).title).toBe("Reversed Title");
  });

  it("handles single quotes in attributes", () => {
    const html = "<meta property='og:title' content='Single Quoted'>";
    expect(extractOgMeta(html).title).toBe("Single Quoted");
  });

  it("returns empty object for HTML with no meta tags", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    expect(extractOgMeta(html)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(extractOgMeta("")).toEqual({});
  });

  it("truncates long titles", () => {
    const longTitle = "A".repeat(300);
    const html = `<meta property="og:title" content="${longTitle}">`;
    const result = extractOgMeta(html);
    expect(result.title?.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it("truncates long descriptions", () => {
    const longDesc = "B".repeat(300);
    const html = `<meta property="og:description" content="${longDesc}">`;
    const result = extractOgMeta(html);
    expect(result.description?.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
  });

  it("trims whitespace from extracted values", () => {
    const html = '<meta property="og:title" content="  Spaced Title  ">';
    expect(extractOgMeta(html).title).toBe("Spaced Title");
  });

  it("handles <title> with whitespace", () => {
    const html = "<title>  Trimmed  </title>";
    expect(extractOgMeta(html).title).toBe("Trimmed");
  });

  it("ignores empty <title>", () => {
    const html = "<title>   </title>";
    expect(extractOgMeta(html)).toEqual({});
  });
});

describe("hasOgTag", () => {
  it("returns true when OG tag exists", () => {
    const html = '<meta property="og:title" content="Test">';
    expect(hasOgTag(html, "og:title")).toBe(true);
  });

  it("returns false when OG tag does not exist", () => {
    const html = '<meta property="og:title" content="Test">';
    expect(hasOgTag(html, "og:description")).toBe(false);
  });

  it("is case-insensitive", () => {
    const html = '<META PROPERTY="og:title" CONTENT="Test">';
    expect(hasOgTag(html, "og:title")).toBe(true);
  });

  it("returns false for empty HTML", () => {
    expect(hasOgTag("", "og:title")).toBe(false);
  });

  it("detects og:image and og:url", () => {
    const html = `<head>
      <meta property="og:image" content="https://example.com/img.png">
      <meta property="og:url" content="https://example.com">
    </head>`;
    expect(hasOgTag(html, "og:image")).toBe(true);
    expect(hasOgTag(html, "og:url")).toBe(true);
    expect(hasOgTag(html, "og:type")).toBe(false);
  });
});

describe("constants", () => {
  it("limits are reasonable", () => {
    expect(MAX_FILE_SIZE).toBe(300 * 1024);
    expect(MAX_TITLE_LENGTH).toBe(256);
    expect(MAX_DESCRIPTION_LENGTH).toBe(200);
    expect(MAX_KEY_NAME_LENGTH).toBe(128);
    expect(MAX_PUBS).toBe(10);
    expect(MAX_PUBS_SUBSCRIBED).toBe(200);
  });

  it("SLUG_PATTERN matches valid patterns", () => {
    expect(SLUG_PATTERN.test("abc")).toBe(true);
    expect(SLUG_PATTERN.test("a-b_c.d")).toBe(true);
    expect(SLUG_PATTERN.test("-invalid")).toBe(false);
  });
});
