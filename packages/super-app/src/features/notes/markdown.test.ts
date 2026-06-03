import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { renderMarkdownToSafeHtml } from "./markdown";

function bodyFor(html: string) {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.body;
}

describe("renderMarkdownToSafeHtml", () => {
  it("renders markdown while removing raw executable HTML", () => {
    const html = renderMarkdownToSafeHtml(
      [
        "# Notes",
        "",
        "[safe](/safe)",
        "",
        '<img src="x" onerror="evil()">',
        "<script>evil()</script>",
      ].join("\n"),
    );

    const body = bodyFor(html);
    expect(body.querySelector("h1")?.textContent).toBe("Notes");
    expect(body.querySelector("a")?.getAttribute("href")).toBe("https://example.com/safe");
    const image = body.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://example.com/x");
    expect(image?.getAttribute("onerror")).toBeNull();
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});
