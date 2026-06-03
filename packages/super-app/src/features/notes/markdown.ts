import { marked } from "marked";
import { sanitizeHtml } from "~/core/sanitize";

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(html);
}
