export const CONTENT_TYPES = ["html", "css", "js", "markdown", "text"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  text: "text/plain; charset=utf-8",
};

export function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pub_${key}`;
}

export function keyPreviewFromKey(key: string): string {
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export function inferContentType(filename: string): ContentType {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
      return "js";
    case "md":
    case "markdown":
      return "markdown";
    default:
      return "text";
  }
}

export const INVALID_SLUG_MESSAGE =
  "Invalid slug format. Use 1-64 chars: letters, numbers, dot, dash, or underscore.";

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
