import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import {
  escapeHtmlAttr,
  escapeXml,
  generateSlug,
  INVALID_SLUG_MESSAGE,
  inferContentType,
  isValidSlug,
  MAX_CONTENT_SIZE,
  MAX_EXPIRY_MS,
  MAX_TITLE_LENGTH,
  MIME_TYPES,
  parseExpiresIn,
  truncate,
} from "../utils";

const HTML_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "img-src https: http: data:",
  "font-src https: http: data:",
  "media-src https: http: data:",
  "style-src 'unsafe-inline' https: http:",
  "script-src 'unsafe-inline' 'unsafe-eval' https: http:",
  "connect-src https: http: wss:",
  "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads",
].join("; ");
const DEFAULT_CSP = "default-src 'none'; sandbox";
const API_KEY_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function baseSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

export function contentSecurityHeaders(mimeType: string) {
  return {
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Security-Policy": mimeType.startsWith("text/html") ? HTML_CSP : DEFAULT_CSP,
  };
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...baseSecurityHeaders() },
  });
}

export function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}

export function getApiKey(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function mapLiveError(error: unknown): { message: string; status: number } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Live not found") return { message, status: 404 };
  if (message === "Live closed") return { message, status: 409 };
  if (message === "Live expired") return { message, status: 410 };
  return null;
}

export function rethrowLiveApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const mapped = mapLiveError(error);
  if (mapped) throw new ApiError(mapped.message, mapped.status);
  throw error;
}

export function rethrowPubLimitError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Pub limit reached")) throw new ApiError(message, 429);
  throw error;
}

export async function executeAction<T>(
  fn: () => Promise<T>,
  onSuccess: (result: T) => Response,
): Promise<Response> {
  try {
    const result = await fn();
    return onSuccess(result);
  } catch (e: unknown) {
    if (e instanceof ApiError) return errorResponse(e.message, e.status);
    console.error("Unexpected HTTP action failure", e);
    return errorResponse("Internal error", 500);
  }
}

export function extractSlugFromPath(pathname: string, prefix: string): string {
  return pathname.slice(prefix.length).replace(/\/$/, "");
}

export function parseSlugFromRequest(request: Request, prefix: string): string | Response {
  const url = new URL(request.url);
  const raw = extractSlugFromPath(url.pathname, prefix);
  if (!raw) return errorResponse("Missing slug", 400);
  let slug: string;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    return errorResponse("Invalid slug encoding", 400);
  }
  if (!isValidSlug(slug)) return errorResponse("Invalid slug format", 400);
  return slug;
}

export async function authenticateApiKey(ctx: ActionCtx, apiKey: string) {
  const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, { key: apiKey });
  if (!user) throw new ApiError("Invalid API key", 401);
  const now = Date.now();
  if (shouldTouchApiKey(user.lastUsedAt, now)) {
    await ctx.runMutation(internal.apiKeys.touchApiKey, { apiKeyId: user.apiKeyId });
  }
  return user;
}

export function shouldTouchApiKey(
  lastUsedAt: number | null | undefined,
  now: number,
  intervalMs = API_KEY_TOUCH_INTERVAL_MS,
): boolean {
  if (typeof lastUsedAt !== "number" || !Number.isFinite(lastUsedAt)) return true;
  return now - lastUsedAt >= intervalMs;
}

export function rateLimitResponse(retryAfter: number) {
  return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.ceil(retryAfter / 1000)),
      ...corsHeaders(),
    },
  });
}

export async function authenticateAndRateLimit(
  ctx: ActionCtx,
  apiKey: string,
  limitName: "createPub" | "readPub" | "listPubs" | "updatePub" | "deletePub" | "agentPollLive",
): Promise<{ userId: Id<"users"> } | Response> {
  const user = await authenticateApiKey(ctx, apiKey);
  const rl = await rateLimiter.limit(ctx, limitName, { key: apiKey });
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  return { userId: user.userId };
}

export function getPublicUrl() {
  return process.env.PUB_PUBLIC_URL ?? "";
}

export function buildOgTags(pub: { title?: string; slug: string }): string {
  const publicUrl = process.env.PUB_PUBLIC_URL ?? "";
  const siteUrl = process.env.CONVEX_SITE_URL ?? "";
  const title = escapeHtmlAttr(pub.title || pub.slug);
  return [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="${escapeHtmlAttr(`${publicUrl}/p/${pub.slug}`)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(`${siteUrl}/og/${pub.slug}`)}" />`,
  ].join("\n  ");
}

const OG_TYPE_COLORS: Record<string, string> = {
  html: "#3b82f6",
  markdown: "#8b5cf6",
  text: "#6b7280",
};

export function getOgCardData(
  pub: { title?: string; slug: string; contentType: string; isPublic: boolean } | null,
  slug: string,
) {
  if (!pub || !pub.isPublic) {
    return {
      title: "pub.blue",
      contentType: "text",
      typeColor: OG_TYPE_COLORS.text,
      badgeColor: "#3b82f6",
      badgeText: "PUB.BLUE",
      slugLabel: "",
    };
  }

  return {
    title: pub.title || pub.slug || slug,
    contentType: pub.contentType,
    typeColor: OG_TYPE_COLORS[pub.contentType] || OG_TYPE_COLORS.text,
    badgeColor: "#10b981",
    badgeText: "PUBLIC",
    slugLabel: `/${slug}`,
  };
}

export {
  escapeHtmlAttr,
  escapeXml,
  generateSlug,
  INVALID_SLUG_MESSAGE,
  inferContentType,
  isValidSlug,
  MAX_CONTENT_SIZE,
  MAX_EXPIRY_MS,
  MAX_TITLE_LENGTH,
  MIME_TYPES,
  parseExpiresIn,
  truncate,
};
