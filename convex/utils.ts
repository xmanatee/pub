export const MAX_FILE_SIZE = 300 * 1024; // 300KB per file
export const MAX_FILES_PER_PUB = 50;
export const MAX_TOTAL_PUB_SIZE = 1.5 * 1024 * 1024; // 1.5MB across all files
export const MAX_TITLE_LENGTH = 256;
export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_KEY_NAME_LENGTH = 128;
export const MAX_PUBS = 10;
export const MAX_PUBS_SUBSCRIBED = 200;
export const SYSTEM_FILE_PREFIX = "_pub/";

export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

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

function extractMetaContent(html: string, attrName: string, attrValue: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta\\s+[^>]*${attrName}\\s*=\\s*["']${attrValue}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attrName}\\s*=\\s*["']${attrValue}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export function extractOgMeta(html: string): { title?: string; description?: string } {
  const result: { title?: string; description?: string } = {};

  const ogTitle = extractMetaContent(html, "property", "og:title");
  if (ogTitle) {
    result.title = truncate(ogTitle, MAX_TITLE_LENGTH);
  } else {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch?.[1]?.trim()) {
      result.title = truncate(titleMatch[1].trim(), MAX_TITLE_LENGTH);
    }
  }

  const ogDesc = extractMetaContent(html, "property", "og:description");
  if (ogDesc) {
    result.description = truncate(ogDesc, MAX_DESCRIPTION_LENGTH);
  } else {
    const metaDesc = extractMetaContent(html, "name", "description");
    if (metaDesc) {
      result.description = truncate(metaDesc, MAX_DESCRIPTION_LENGTH);
    }
  }

  return result;
}

export function hasOgTag(html: string, property: string): boolean {
  return new RegExp(`<meta\\s+[^>]*property\\s*=\\s*["']${property}["']`, "i").test(html);
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isValidFilePath(path: string): boolean {
  if (!path || path.length > 256) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("..")) return false;
  if (path.includes("//") || path.includes("\\")) return false;
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) < 0x20) return false;
  }
  if (path.startsWith(SYSTEM_FILE_PREFIX)) return false;
  const segments = path.split("/");
  return segments.every((s) => s.length > 0 && s.length <= 128 && !DANGEROUS_KEYS.has(s));
}

const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".wasm": "application/wasm",
};

export function mimeFromPath(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  const ext = path.slice(dot).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export function validateFiles(
  files: Record<string, string>,
): { ok: true } | { ok: false; error: string } {
  const paths = Object.keys(files);

  if (!paths.includes("index.html")) {
    return { ok: false, error: "Missing required file: index.html" };
  }
  if (paths.length > MAX_FILES_PER_PUB) {
    return { ok: false, error: `Too many files (max ${MAX_FILES_PER_PUB})` };
  }

  let totalSize = 0;
  for (const [path, content] of Object.entries(files)) {
    if (!isValidFilePath(path)) {
      return { ok: false, error: `Invalid file path: ${path}` };
    }
    const size = new TextEncoder().encode(content).byteLength;
    if (size > MAX_FILE_SIZE) {
      return { ok: false, error: `File ${path} exceeds max size (${MAX_FILE_SIZE / 1024}KB)` };
    }
    totalSize += size;
  }

  if (totalSize > MAX_TOTAL_PUB_SIZE) {
    return {
      ok: false,
      error: `Total size exceeds max (${(MAX_TOTAL_PUB_SIZE / 1024 / 1024).toFixed(1)}MB)`,
    };
  }

  return { ok: true };
}
