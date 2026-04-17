/**
 * Readability parse + sanitization. Server-only because linkedom is a Node
 * dependency; doing this on the client would pull the DOM shim into the
 * browser bundle unnecessarily.
 */
import { Readability } from "@mozilla/readability";
import { createServerFn } from "@tanstack/react-start";
import { parseHTML } from "linkedom";
import type { ReaderResult } from "./commands";
import { sanitizeReaderHtml } from "./sanitize";

interface SimplifyInput {
  url: string;
  html: string;
}

function validateSimplifyInput(input: unknown): SimplifyInput {
  if (!input || typeof input !== "object") {
    throw new Error("reader.simplify input must be an object");
  }

  const { url, html } = input as Partial<SimplifyInput>;
  if (typeof url !== "string" || typeof html !== "string") {
    throw new Error("reader.simplify requires string url and html");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("reader.simplify url must be absolute");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("reader.simplify only accepts http and https URLs");
  }

  return { url: parsed.toString(), html };
}

export const simplify = createServerFn({ method: "POST" })
  .inputValidator(validateSimplifyInput)
  .handler(async ({ data }): Promise<ReaderResult> => {
    const { document } = parseHTML(data.html);
    const article = new Readability(document as unknown as Document).parse();
    if (!article) throw new Error("could not extract readable content");
    return {
      url: data.url,
      title: article.title ?? "",
      byline: article.byline ?? null,
      excerpt: article.excerpt ?? null,
      contentHtml: sanitizeReaderHtml(article.content ?? "", data.url),
      textContent: article.textContent ?? "",
      siteName: article.siteName ?? null,
      publishedTime: (article as { publishedTime?: string }).publishedTime ?? null,
      fetchedAt: Date.now(),
    };
  });
