import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { sanitizeReaderHtml } from "./sanitize";

function bodyFor(html: string) {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.body;
}

describe("sanitizeReaderHtml", () => {
  it("keeps only safe resolved HTTP URLs for links and images", () => {
    const sanitized = sanitizeReaderHtml(
      [
        '<a href="javascript:alert(1)" title="bad">bad link</a>',
        '<a href="">empty link</a>',
        '<a href="/safe">safe link</a>',
        '<img src="data:text/html,evil" alt="bad image">',
        '<img src="./image.png" alt="safe image" onerror="alert(1)">',
      ].join(""),
      "https://example.com/articles/read",
    );

    const body = bodyFor(sanitized);
    const links = Array.from(body.querySelectorAll("a"));
    const images = Array.from(body.querySelectorAll("img"));

    expect(links[0]?.hasAttribute("href")).toBe(false);
    expect(links[0]?.hasAttribute("target")).toBe(false);
    expect(links[1]?.hasAttribute("href")).toBe(false);
    expect(links[2]?.getAttribute("href")).toBe("https://example.com/safe");
    expect(links[2]?.getAttribute("target")).toBe("_blank");
    expect(links[2]?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toBe("https://example.com/articles/image.png");
    expect(images[0]?.getAttribute("onerror")).toBeNull();
  });

  it("removes executable tags, unsafe attributes, and invalid numeric attributes", () => {
    const sanitized = sanitizeReaderHtml(
      [
        "<script>alert(1)</script>",
        '<p onclick="alert(1)">hello <strong>world</strong></p>',
        '<table><tr><td colspan="2" rowspan="evil">cell</td></tr></table>',
      ].join(""),
      "https://example.com/",
    );

    const body = bodyFor(sanitized);
    const paragraph = body.querySelector("p");
    const cell = body.querySelector("td");

    expect(sanitized).not.toContain("<script");
    expect(paragraph?.getAttribute("onclick")).toBeNull();
    expect(paragraph?.querySelector("strong")?.textContent).toBe("world");
    expect(cell?.getAttribute("colspan")).toBe("2");
    expect(cell?.hasAttribute("rowspan")).toBe(false);
  });
});
