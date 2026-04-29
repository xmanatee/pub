import { sanitizeHtml } from "~/core/sanitize";

export function sanitizeReaderHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, baseUrl);
}
