import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHtmlSrcdoc, buildTextSrcdoc, escapeHtml, formatRelativeTime } from "./pub-preview";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("handles multiple special characters", () => {
    expect(escapeHtml("a<b&c>d")).toBe("a&lt;b&amp;c&gt;d");
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("buildTextSrcdoc", () => {
  it("wraps text content in a pre element", () => {
    const result = buildTextSrcdoc("hello\nworld", "text");
    expect(result).toContain("<pre");
    expect(result).toContain("hello\nworld");
    expect(result).toContain("white-space:pre-wrap");
  });

  it("wraps non-text content in a div", () => {
    const result = buildTextSrcdoc("some markdown", "markdown");
    expect(result).toContain("<div>");
    expect(result).toContain("some markdown");
    expect(result).not.toContain("<pre");
  });

  it("escapes HTML in the content", () => {
    const result = buildTextSrcdoc("<script>alert(1)</script>", "text");
    expect(result).toContain("&lt;script&gt;");
    expect(result).not.toContain("<script>");
  });

  it("includes preview styles", () => {
    const result = buildTextSrcdoc("test", "text");
    expect(result).toContain("<style>");
    expect(result).toContain("font-family:system-ui");
  });
});

describe("buildHtmlSrcdoc", () => {
  it("prepends styles to raw HTML", () => {
    const result = buildHtmlSrcdoc("<h1>Title</h1>");
    expect(result).toContain("<style>");
    expect(result).toContain("<h1>Title</h1>");
  });

  it("does not escape the HTML content", () => {
    const result = buildHtmlSrcdoc("<b>bold</b>");
    expect(result).toContain("<b>bold</b>");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'expired' for past timestamps", () => {
    const past = Date.now() - 1000;
    expect(formatRelativeTime(past)).toBe("expired");
  });

  it("returns 'expired' for exactly now", () => {
    expect(formatRelativeTime(Date.now())).toBe("expired");
  });

  it("returns minutes for < 1 hour", () => {
    const future = Date.now() + 30 * 60 * 1000;
    expect(formatRelativeTime(future)).toBe("30m");
  });

  it("returns hours for < 1 day", () => {
    const future = Date.now() + 5 * 60 * 60 * 1000;
    expect(formatRelativeTime(future)).toBe("5h");
  });

  it("returns days for >= 24 hours", () => {
    const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(future)).toBe("3d");
  });

  it("returns 0m for very small positive diff", () => {
    const future = Date.now() + 30 * 1000;
    expect(formatRelativeTime(future)).toBe("0m");
  });
});
