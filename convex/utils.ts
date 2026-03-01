import { v } from "convex/values";

export const CONTENT_TYPES = ["html", "markdown", "text"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const CONTENT_TYPE_VALIDATOR = v.union(
  v.literal("html"),
  v.literal("markdown"),
  v.literal("text"),
);

export const MAX_CONTENT_SIZE = 100 * 1024; // 100KB
export const MAX_TITLE_LENGTH = 256;
export const MAX_KEY_NAME_LENGTH = 128;
export const MAX_PUBS = 10;
export const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
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

export function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

export function parseExpiresIn(value: unknown): number | null {
  if (typeof value === "number") {
    return value > 0 ? value * 1000 : null;
  }
  if (typeof value === "string") {
    return parseDuration(value);
  }
  return null;
}
