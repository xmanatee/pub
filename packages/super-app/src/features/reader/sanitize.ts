import { parseHTML } from "linkedom";

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

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);
const POSITIVE_INTEGER_ATTRS = new Set(["width", "height", "colspan", "rowspan"]);

function normalizeSafeUrl(value: string, baseUrl: string): string | null {
  if (value.trim() === "") return null;

  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return null;
  }
  return SAFE_URL_PROTOCOLS.has(url.protocol) ? url.toString() : null;
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d{0,3}$/.test(value.trim());
}

function sanitizeAttribute(node: Element, name: string, value: string, baseUrl: string): void {
  if (name === "href" || name === "src") {
    const normalized = normalizeSafeUrl(value, baseUrl);
    if (normalized) node.setAttribute(name, normalized);
    else node.removeAttribute(name);
    return;
  }

  if (POSITIVE_INTEGER_ATTRS.has(name) && !isPositiveInteger(value)) {
    node.removeAttribute(name);
  }
}

export function sanitizeReaderHtml(html: string, baseUrl: string): string {
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
      sanitizeAttribute(node, name, attr.value, baseUrl);
    }

    if (tag === "a" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer noopener");
    }

    if (tag === "img" && !node.hasAttribute("src")) {
      node.remove();
      return;
    }

    for (const child of Array.from(node.children)) walk(child);
  };

  for (const child of Array.from(document.body.children)) walk(child);
  return document.body.innerHTML;
}
