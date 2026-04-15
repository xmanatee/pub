/**
 * Readability parse + sanitization. Server-only because linkedom is a Node
 * dependency; doing this on the client would pull the DOM shim into the
 * browser bundle unnecessarily.
 */
import { Readability } from "@mozilla/readability";
import { createServerFn } from "@tanstack/react-start";
import { parseHTML } from "linkedom";
import type { ReaderResult } from "./commands";

const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "blockquote",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "br",
  "hr",
  "div",
  "span",
  "section",
  "article",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

function sanitize(html: string, baseUrl: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      if (tag === "script" || tag === "style") {
        node.remove();
      } else {
        const span = document.createElement("span");
        span.textContent = node.textContent ?? "";
        node.replaceWith(span);
      }
      return;
    }
    const allowed = ALLOWED_ATTRS[tag];
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowed?.has(name)) {
        node.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src") && attr.value && URL.canParse(attr.value, baseUrl)) {
        node.setAttribute(name, new URL(attr.value, baseUrl).toString());
      }
      if (name === "href") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noreferrer noopener");
      }
    }
    for (const child of Array.from(node.children)) walk(child);
  };
  for (const child of Array.from(document.body.children)) walk(child);
  return document.body.innerHTML;
}

export const simplify = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string; html: string }) => input)
  .handler(async ({ data }): Promise<ReaderResult> => {
    const { document } = parseHTML(data.html);
    const article = new Readability(document as unknown as Document).parse();
    if (!article) throw new Error("could not extract readable content");
    return {
      url: data.url,
      title: article.title ?? "",
      byline: article.byline ?? null,
      excerpt: article.excerpt ?? null,
      contentHtml: sanitize(article.content ?? "", data.url),
      textContent: article.textContent ?? "",
      siteName: article.siteName ?? null,
      publishedTime: (article as { publishedTime?: string }).publishedTime ?? null,
      fetchedAt: Date.now(),
    };
  });
