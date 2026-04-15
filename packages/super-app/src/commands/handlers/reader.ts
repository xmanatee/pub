import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ReaderResult } from "../results";

const FETCH_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

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
        const text = node.textContent ?? "";
        const span = document.createElement("span");
        span.textContent = text;
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

export async function fetch_(params: { url: string }): Promise<ReaderResult> {
  const res = await fetch(params.url, { headers: FETCH_HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${params.url}`);
  const html = await res.text();
  const finalUrl = res.url;
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article) throw new Error("could not extract readable content");
  return {
    url: finalUrl,
    title: article.title ?? "",
    byline: article.byline ?? null,
    excerpt: article.excerpt ?? null,
    contentHtml: sanitize(article.content ?? "", finalUrl),
    textContent: article.textContent ?? "",
    siteName: article.siteName ?? null,
    publishedTime: (article as { publishedTime?: string }).publishedTime ?? null,
    fetchedAt: Date.now(),
  };
}

// `fetch` is a builtin global; export under that name for the manifest fn ref.
export { fetch_ as fetch };
