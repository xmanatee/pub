import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { httpAction } from "../_generated/server";
import { getPublicUrl, getSiteUrl } from "../env";
import { rateLimiter } from "../rateLimits";
import { escapeHtmlAttr, hasOgTag, isValidSlug } from "../utils";

// Sandbox tokens and permissions features are canonical in web/src/features/live/lib/sandbox-policy.ts.
// A test in sandbox-policy.test.ts reads this file and verifies both lists stay in sync.
const CONTENT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "img-src https: http: data:",
  "font-src https: http: data:",
  "media-src https: http: data:",
  "style-src 'unsafe-inline' https: http:",
  "script-src 'unsafe-inline' 'unsafe-eval' https: http:",
  "connect-src https: http: wss:",
  "sandbox allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-orientation-lock allow-top-navigation-by-user-activation",
].join("; ");

const CONTENT_PERMISSIONS_POLICY = [
  "camera=*",
  "microphone=*",
  "display-capture=*",
  "geolocation=*",
  "fullscreen=*",
  "autoplay=*",
  "clipboard-read=*",
  "clipboard-write=*",
  "accelerometer=*",
  "gyroscope=*",
  "magnetometer=*",
  "midi=*",
  "gamepad=*",
  "screen-wake-lock=*",
  "web-share=*",
].join(", ");

const API_KEY_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, sentry-trace, baggage",
  };
}

export const corsPreflightHandler = httpAction(async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
});

function baseSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

export function contentSecurityHeaders() {
  return {
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Security-Policy": CONTENT_CSP,
    "Permissions-Policy": CONTENT_PERMISSIONS_POLICY,
  };
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...baseSecurityHeaders() },
  });
}

export function errorResponse(message: string, status: number, code?: string) {
  return jsonResponse(code ? { error: message, code } : { error: message }, status);
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
    public code?: string,
  ) {
    super(message);
  }
}

export function mapLiveError(error: unknown): { message: string; status: number } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Connection not found")) return { message, status: 404 };
  if (message.includes("Connection assigned to another agent")) return { message, status: 409 };
  if (message.includes("Agent went offline")) return { message, status: 409 };
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
  if (message.includes("Pub limit reached")) throw new ApiError(message, 429);
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
    if (e instanceof ApiError) return errorResponse(e.message, e.status, e.code);
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

function parseServePathParts(
  request: Request,
  prefix: string,
  fixedParts: number,
): { parts: string[]; filePath: string } | Response {
  const url = new URL(request.url);
  const afterPrefix = url.pathname.slice(prefix.length);
  const normalized = afterPrefix.replace(/\/$/, "");
  const parts = normalized.length > 0 ? normalized.split("/") : [];
  if (parts.length < fixedParts) {
    return errorResponse("Missing path", 400);
  }
  const filePath = parts.slice(fixedParts).join("/") || "index.html";
  return { parts, filePath };
}

function decodeServeSlug(rawSlug: string): string | Response {
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return errorResponse("Invalid slug encoding", 400);
  }
  if (!isValidSlug(slug)) return errorResponse("Invalid slug format", 400);
  return slug;
}

export function parseServeRequest(request: Request): { slug: string; filePath: string } | Response {
  const parsed = parseServePathParts(request, "/serve/", 1);
  if (parsed instanceof Response) return parsed;
  const slug = decodeServeSlug(parsed.parts[0]);
  if (slug instanceof Response) return slug;
  return { slug, filePath: parsed.filePath };
}

export function parsePrivateServeRequest(
  request: Request,
): { slug: string; token: string; filePath: string } | Response {
  const parsed = parseServePathParts(request, "/serve-private/", 2);
  if (parsed instanceof Response) return parsed;
  const slug = decodeServeSlug(parsed.parts[0]);
  if (slug instanceof Response) return slug;
  const token = parsed.parts[1];
  if (!token) {
    return errorResponse("Missing access token", 400);
  }
  return { slug, token, filePath: parsed.filePath };
}

async function authenticateApiKey(ctx: ActionCtx, apiKey: string) {
  const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, { key: apiKey });
  if (!user) throw new ApiError("Invalid API key", 401);
  const now = Date.now();
  if (shouldTouchApiKey(user.lastUsedAt, now)) {
    await ctx.runMutation(internal.apiKeys.touchApiKey, { apiKeyId: user.apiKeyId });
  }
  return user;
}

export function shouldTouchApiKey(
  lastUsedAt: number | null,
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

type PubRateLimit = "createPub" | "readPub" | "listPubs" | "updatePub" | "deletePub";

type AgentRateLimit =
  | "presenceOnline"
  | "presenceOffline"
  | "presenceHeartbeat"
  | "agentPollLive"
  | "signalLive"
  | "closeLive"
  | "telegramBotUpdate";

async function safeAuthenticate(ctx: ActionCtx, apiKey: string) {
  try {
    return await authenticateApiKey(ctx, apiKey);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e.message, e.status, e.code);
    throw e;
  }
}

export async function authenticateAndRateLimit(
  ctx: ActionCtx,
  apiKey: string,
  limitName: PubRateLimit,
): Promise<{ userId: Id<"users"> } | Response> {
  const user = await safeAuthenticate(ctx, apiKey);
  if (user instanceof Response) return user;
  const rl = await rateLimiter.limit(ctx, limitName, { key: apiKey });
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  return { userId: user.userId };
}

export async function authenticateAgentAndRateLimit(
  ctx: ActionCtx,
  request: Request,
  limitName: AgentRateLimit,
): Promise<{ userId: Id<"users">; apiKeyId: Id<"apiKeys"> } | Response> {
  const apiKey = getApiKey(request);
  if (!apiKey) return errorResponse("Missing API key", 401);
  const user = await safeAuthenticate(ctx, apiKey);
  if (user instanceof Response) return user;
  const rl = await rateLimiter.limit(ctx, limitName, { key: apiKey });
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  return { userId: user.userId, apiKeyId: user.apiKeyId };
}

export function buildSupplementalOgTags(
  pub: { title?: string; description?: string; slug: string },
  html: string,
): string {
  const publicUrl = getPublicUrl();
  const siteUrl = getSiteUrl();
  const title = escapeHtmlAttr(pub.title || pub.slug);
  const tags: string[] = [];

  if (!hasOgTag(html, "og:title")) {
    tags.push(`<meta property="og:title" content="${title}" />`);
  }
  if (!hasOgTag(html, "og:type")) {
    tags.push(`<meta property="og:type" content="article" />`);
  }
  if (!hasOgTag(html, "og:url")) {
    tags.push(
      `<meta property="og:url" content="${escapeHtmlAttr(`${publicUrl}/p/${pub.slug}`)}" />`,
    );
  }
  if (!hasOgTag(html, "og:image")) {
    tags.push(
      `<meta property="og:image" content="${escapeHtmlAttr(`${siteUrl}/og/${pub.slug}`)}" />`,
    );
  }
  if (pub.description && !hasOgTag(html, "og:description")) {
    tags.push(`<meta property="og:description" content="${escapeHtmlAttr(pub.description)}" />`);
  }

  return tags.join("\n  ");
}

export function injectIntoHead(content: string, injection: string): string {
  const match = content.match(/<\/head\s*>/i);
  if (match?.index !== undefined) {
    return content.slice(0, match.index) + injection + content.slice(match.index);
  }
  return `<head>${injection}</head>${content}`;
}

export function getOgCardData(
  pub: { title?: string; slug: string; isPublic: boolean } | null,
  slug: string,
) {
  if (!pub || !pub.isPublic) {
    return {
      title: "pub.blue",
      badgeColor: "#3b82f6",
      badgeText: "PUB.BLUE",
      slugLabel: "",
    };
  }

  return {
    title: pub.title || pub.slug || slug,
    badgeColor: "#10b981",
    badgeText: "PUBLIC",
    slugLabel: `/${slug}`,
  };
}
