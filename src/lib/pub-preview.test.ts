import { describe, expect, it } from "vitest";
import { buildHtmlSrcdoc, buildTextSrcdoc, escapeHtml } from "./pub-preview";

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
