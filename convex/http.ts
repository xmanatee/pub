import { httpRouter } from "convex/server";
import { Feed } from "feed";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { rateLimiter } from "./rateLimits";
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
} from "./utils";

const http = httpRouter();

auth.addHttpRoutes(http);

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

function publicationSecurityHeaders(mimeType: string) {
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

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function mapTunnelError(error: unknown): { message: string; status: number } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Tunnel not found") return { message, status: 404 };
  if (message === "Tunnel closed") return { message, status: 409 };
  if (message === "Tunnel expired") return { message, status: 410 };
  if (message.startsWith("Tunnel limit reached")) return { message, status: 429 };
  return null;
}

function rethrowTunnelApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const mapped = mapTunnelError(error);
  if (mapped) throw new ApiError(mapped.message, mapped.status);
  throw error;
}

async function executeAction<T>(
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

function parseSlugFromRequest(request: Request, prefix: string): string | Response {
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

async function authenticateApiKey(ctx: ActionCtx, apiKey: string) {
  const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, { key: apiKey });
  if (!user) throw new ApiError("Invalid API key", 401);
  await ctx.runMutation(internal.apiKeys.touchApiKey, { apiKeyId: user.apiKeyId });
  return user;
}

function rateLimitResponse(retryAfter: number) {
  return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.ceil(retryAfter / 1000)),
      ...corsHeaders(),
    },
  });
}

async function authenticateAndRateLimit(
  ctx: ActionCtx,
  apiKey: string,
  limitName:
    | "createPublication"
    | "readPublication"
    | "listPublications"
    | "updatePublication"
    | "deletePublication",
): Promise<{ userId: Id<"users"> } | Response> {
  const user = await authenticateApiKey(ctx, apiKey);
  const rl = await rateLimiter.limit(ctx, limitName, { key: apiKey });
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);
  return { userId: user.userId };
}

function getPublicUrl() {
  return process.env.PUB_PUBLIC_URL ?? "";
}

function buildOgTags(pub: { title?: string; slug: string }): string {
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
      title: "pub.blue publication",
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

const corsPreflightHandler = httpAction(async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
});

http.route({
  path: "/api/v1/publications",
  method: "OPTIONS",
  handler: corsPreflightHandler,
});

http.route({
  pathPrefix: "/api/v1/publications/",
  method: "OPTIONS",
  handler: corsPreflightHandler,
});

http.route({
  path: "/api/v1/publications",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    let body: {
      content: string;
      filename?: string;
      title?: string;
      slug?: string;
      isPublic?: boolean;
      expiresIn?: string | number;
    };

    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    if (!body.content) {
      return errorResponse("Missing required field: content", 400);
    }
    if (body.content.length > MAX_CONTENT_SIZE) {
      return errorResponse("Content exceeds maximum size of 100KB", 400);
    }
    if (body.slug && !isValidSlug(body.slug)) {
      return errorResponse(INVALID_SLUG_MESSAGE, 400);
    }
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      return errorResponse(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`, 400);
    }

    let expiresAt: number | undefined;
    if (body.expiresIn !== undefined) {
      const ms = parseExpiresIn(body.expiresIn);
      if (!ms || ms <= 0) return errorResponse("Invalid expiresIn value", 400);
      if (ms > MAX_EXPIRY_MS) return errorResponse("Expiry cannot exceed 30 days", 400);
      expiresAt = Date.now() + ms;
    }

    const auth = await authenticateAndRateLimit(ctx, apiKey, "createPublication");
    if (auth instanceof Response) return auth;

    return executeAction(
      async () => {
        const contentType = inferContentType(body.filename ?? "file.txt");
        const finalSlug = body.slug || generateSlug();

        const existing = await ctx.runQuery(internal.publications.getBySlugInternal, {
          slug: finalSlug,
        });
        if (existing) throw new ApiError("Slug already taken", 409);

        await ctx.runMutation(internal.publications.createPublication, {
          userId: auth.userId,
          slug: finalSlug,
          contentType,
          content: body.content,
          title: body.title,
          isPublic: body.isPublic ?? false,
          expiresAt,
        });

        return { slug: finalSlug, expiresAt };
      },
      (result) => {
        const url = `${getPublicUrl()}/p/${encodeURIComponent(result.slug)}`;
        const response: Record<string, unknown> = { slug: result.slug, url };
        if (result.expiresAt) response.expiresAt = result.expiresAt;
        return jsonResponse(response, 201);
      },
    );
  }),
});

http.route({
  path: "/api/v1/publications",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);

    const auth = await authenticateAndRateLimit(ctx, apiKey, "listPublications");
    if (auth instanceof Response) return auth;

    return executeAction(
      async () => {
        const result = await ctx.runQuery(internal.publications.listByUserInternal, {
          userId: auth.userId,
          cursor,
          limit,
        });

        return {
          publications: result.publications.map((p) => ({
            slug: p.slug,
            contentType: p.contentType,
            title: p.title,
            isPublic: p.isPublic,
            expiresAt: p.expiresAt,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
          cursor: result.isDone ? undefined : result.cursor,
          hasMore: !result.isDone,
        };
      },
      (result) => {
        return jsonResponse({
          publications: result.publications,
          cursor: result.cursor,
          hasMore: result.hasMore,
        });
      },
    );
  }),
});

http.route({
  pathPrefix: "/api/v1/publications/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const slug = parseSlugFromRequest(request, "/api/v1/publications/");
    if (slug instanceof Response) return slug;

    const auth = await authenticateAndRateLimit(ctx, apiKey, "readPublication");
    if (auth instanceof Response) return auth;

    return executeAction(
      async () => {
        const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
        if (!pub || pub.userId !== auth.userId) throw new ApiError("Publication not found", 404);
        return {
          slug: pub.slug,
          contentType: pub.contentType,
          content: pub.content,
          title: pub.title,
          isPublic: pub.isPublic,
          expiresAt: pub.expiresAt,
          createdAt: pub.createdAt,
          updatedAt: pub.updatedAt,
        };
      },
      (publication) => jsonResponse({ publication }),
    );
  }),
});

http.route({
  pathPrefix: "/api/v1/publications/",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const slug = parseSlugFromRequest(request, "/api/v1/publications/");
    if (slug instanceof Response) return slug;

    let body: {
      content?: string;
      filename?: string;
      title?: string;
      isPublic?: boolean;
      slug?: string;
    };
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    if (body.content && body.content.length > MAX_CONTENT_SIZE) {
      return errorResponse("Content exceeds maximum size of 100KB", 400);
    }
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      return errorResponse(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`, 400);
    }
    if (body.slug !== undefined) {
      if (!isValidSlug(body.slug)) return errorResponse(INVALID_SLUG_MESSAGE, 400);
    }

    const auth = await authenticateAndRateLimit(ctx, apiKey, "updatePublication");
    if (auth instanceof Response) return auth;

    return executeAction(
      async () => {
        const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
        if (!pub || pub.userId !== auth.userId) throw new ApiError("Publication not found", 404);

        if (body.slug && body.slug !== pub.slug) {
          const existing = await ctx.runQuery(internal.publications.getBySlugInternal, {
            slug: body.slug,
          });
          if (existing) throw new ApiError("Slug already taken", 409);
        }

        const contentType = body.filename ? inferContentType(body.filename) : undefined;

        await ctx.runMutation(internal.publications.updatePublication, {
          id: pub._id,
          content: body.content,
          contentType,
          title: body.title,
          isPublic: body.isPublic,
          slug: body.slug,
        });

        return {
          slug: body.slug ?? pub.slug,
          contentType: contentType ?? pub.contentType,
          title: body.title !== undefined ? body.title : pub.title,
          isPublic: body.isPublic !== undefined ? body.isPublic : pub.isPublic,
          updatedAt: Date.now(),
        };
      },
      (result) => jsonResponse(result),
    );
  }),
});

http.route({
  pathPrefix: "/api/v1/publications/",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const slug = parseSlugFromRequest(request, "/api/v1/publications/");
    if (slug instanceof Response) return slug;

    const auth = await authenticateAndRateLimit(ctx, apiKey, "deletePublication");
    if (auth instanceof Response) return auth;

    return executeAction(
      async () => {
        const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
        if (!pub || pub.userId !== auth.userId) throw new ApiError("Publication not found", 404);
        await ctx.runMutation(internal.publications.deletePublication, {
          id: pub._id,
          userId: auth.userId,
        });
      },
      () => jsonResponse({ deleted: true }),
    );
  }),
});

http.route({
  pathPrefix: "/serve/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const slug = parseSlugFromRequest(request, "/serve/");
    if (slug instanceof Response) return slug;

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await rateLimiter.limit(ctx, "serveContent", { key: clientIp });
    if (!rl.ok) return rateLimitResponse(rl.retryAfter);

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
    if (!pub || !pub.isPublic) {
      return new Response("Not found", { status: 404 });
    }

    const isPreview = new URL(request.url).searchParams.get("preview") === "1";
    if (!isPreview) {
      await ctx.runMutation(internal.analytics.recordView, { slug });
    }

    if (pub.contentType === "markdown") {
      const { marked } = await import("marked");
      const rendered = await marked.parse(pub.content);
      const titleTag = pub.title ? `<title>${escapeHtmlAttr(pub.title)}</title>` : "";
      const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${titleTag}
  ${buildOgTags(pub)}
  <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6}
  pre{background:#f5f5f5;padding:1em;overflow-x:auto;border-radius:4px}
  code{background:#f5f5f5;padding:.2em .4em;border-radius:3px}img{max-width:100%}</style>
</head><body>${rendered}</body></html>`;
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          ...publicationSecurityHeaders("text/html"),
        },
      });
    }

    if (pub.contentType === "html") {
      const hasHead = pub.content.includes("<head");
      const content = hasHead ? pub.content : `<head>${buildOgTags(pub)}</head>${pub.content}`;
      const mimeType = MIME_TYPES[pub.contentType];
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=60",
          ...publicationSecurityHeaders(mimeType),
        },
      });
    }

    const mimeType = MIME_TYPES[pub.contentType];

    return new Response(pub.content, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=60",
        ...publicationSecurityHeaders(mimeType),
      },
    });
  }),
});

http.route({
  pathPrefix: "/og/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const slug = parseSlugFromRequest(request, "/og/");
    if (slug instanceof Response) return slug;

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
    const og = getOgCardData(pub, slug);

    const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1100" cy="100" r="200" fill="#3b82f6" opacity="0.08"/>
  <circle cx="100" cy="530" r="150" fill="#8b5cf6" opacity="0.06"/>
  <text x="80" y="200" font-family="system-ui,sans-serif" font-size="64" font-weight="700" fill="#f8fafc">${escapeXml(truncate(og.title, 40))}</text>
  <rect x="80" y="240" width="${og.contentType.length * 18 + 32}" height="40" rx="8" fill="${og.typeColor}" opacity="0.2"/>
  <text x="96" y="268" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="${og.typeColor}">${og.contentType.toUpperCase()}</text>
  <rect x="${80 + og.contentType.length * 18 + 48}" y="240" width="${og.badgeText.length * 16 + 32}" height="40" rx="8" fill="${og.badgeColor}" opacity="0.2"/>
  <text x="${96 + og.contentType.length * 18 + 48}" y="268" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="${og.badgeColor}">${og.badgeText}</text>
  <text x="80" y="540" font-family="system-ui,sans-serif" font-size="32" font-weight="600" fill="#3b82f6">pub.blue</text>
  <text x="260" y="540" font-family="system-ui,sans-serif" font-size="24" fill="#64748b">${escapeXml(og.slugLabel)}</text>
</svg>`;

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }),
});

http.route({
  pathPrefix: "/rss/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const userId = url.pathname.slice("/rss/".length).replace(/\/$/, "");
    if (!userId) return errorResponse("Missing user ID", 400);

    const publicUrl = getPublicUrl();
    const siteUrl = process.env.CONVEX_SITE_URL ?? "";

    const pubs = await ctx.runQuery(internal.publications.listPublicByUserInternal, {
      userId,
      limit: 50,
    });

    const feed = new Feed({
      title: "pub.blue publications",
      id: `${publicUrl}/`,
      link: `${publicUrl}/`,
      copyright: "",
      language: "en",
      feedLinks: {
        rss: `${siteUrl}/rss/${userId}`,
      },
    });

    for (const pub of pubs) {
      feed.addItem({
        title: pub.title || pub.slug,
        id: `${publicUrl}/p/${pub.slug}`,
        link: `${publicUrl}/p/${pub.slug}`,
        date: new Date(pub.createdAt),
        description: `${pub.contentType} publication`,
      });
    }

    return new Response(feed.rss2(), {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }),
});

// -- Tunnel API routes -------------------------------------------------------

const TUNNEL_ID_PATTERN = /^[a-z0-9]{8,32}$/;
const MAX_TUNNEL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TUNNEL_EXPIRY_MS = 24 * 60 * 60 * 1000;

function isValidTunnelId(id: string): boolean {
  return TUNNEL_ID_PATTERN.test(id);
}

function generateTunnelId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

http.route({
  path: "/api/v1/tunnels",
  method: "OPTIONS",
  handler: corsPreflightHandler,
});

http.route({
  pathPrefix: "/api/v1/tunnels/",
  method: "OPTIONS",
  handler: corsPreflightHandler,
});

http.route({
  path: "/api/v1/tunnels",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    let body: { expiresIn?: string | number };
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    let expiresMs = DEFAULT_TUNNEL_EXPIRY_MS;
    if (body.expiresIn !== undefined) {
      const ms = parseExpiresIn(body.expiresIn);
      if (!ms || ms <= 0) return errorResponse("Invalid expiresIn value", 400);
      if (ms > MAX_TUNNEL_EXPIRY_MS) return errorResponse("Expiry cannot exceed 7 days", 400);
      expiresMs = ms;
    }

    const user = await authenticateApiKey(ctx, apiKey);
    const rl = await rateLimiter.limit(ctx, "createTunnelV2", { key: apiKey });
    if (!rl.ok) return rateLimitResponse(rl.retryAfter);

    const tunnelId = generateTunnelId();
    const expiresAt = Date.now() + expiresMs;

    return executeAction(
      async () => {
        try {
          await ctx.runMutation(internal.tunnels.createTunnel, {
            userId: user.userId,
            tunnelId,
            expiresAt,
          });
        } catch (error) {
          rethrowTunnelApiError(error);
        }
        return { tunnelId, expiresAt };
      },
      (result) => {
        const url = `${getPublicUrl()}/t/${result.tunnelId}`;
        return jsonResponse({ tunnelId: result.tunnelId, url, expiresAt: result.expiresAt }, 201);
      },
    );
  }),
});

http.route({
  pathPrefix: "/api/v1/tunnels/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const url = new URL(request.url);
    const path = url.pathname.slice("/api/v1/tunnels/".length).replace(/\/$/, "");

    if (!path) {
      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "readTunnelV2", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        () => ctx.runQuery(internal.tunnels.listByUserInternal, { userId: user.userId }),
        (tunnels) => jsonResponse({ tunnels }),
      );
    }

    const pathParts = path.split("/");
    if (pathParts.length !== 1) return errorResponse("Invalid tunnel path", 400);

    const tunnelId = pathParts[0];
    if (!isValidTunnelId(tunnelId)) return errorResponse("Invalid tunnel ID", 400);

    const user = await authenticateApiKey(ctx, apiKey);
    const rl = await rateLimiter.limit(ctx, "readTunnelV2", { key: apiKey });
    if (!rl.ok) return rateLimitResponse(rl.retryAfter);

    return executeAction(
      async () => {
        const tunnel = await ctx.runQuery(internal.tunnels.getByTunnelIdInternal, { tunnelId });
        if (!tunnel || tunnel.userId !== user.userId) throw new ApiError("Tunnel not found", 404);
        return {
          tunnelId: tunnel.tunnelId,
          status: tunnel.status,
          agentOffer: tunnel.agentOffer,
          browserAnswer: tunnel.browserAnswer,
          agentCandidates: tunnel.agentCandidates,
          browserCandidates: tunnel.browserCandidates,
          createdAt: tunnel.createdAt,
          expiresAt: tunnel.expiresAt,
        };
      },
      (tunnel) => jsonResponse({ tunnel }),
    );
  }),
});

http.route({
  pathPrefix: "/api/v1/tunnels/",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const url = new URL(request.url);
    const pathParts = url.pathname.slice("/api/v1/tunnels/".length).split("/");
    const tunnelId = pathParts[0];
    if (!tunnelId || !isValidTunnelId(tunnelId)) return errorResponse("Invalid tunnel ID", 400);
    if (pathParts.length !== 2 || pathParts[1] !== "signal") {
      return errorResponse("Invalid tunnel signal path", 400);
    }

    let body: { offer?: string; candidates?: string[] };
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const user = await authenticateApiKey(ctx, apiKey);
    const rl = await rateLimiter.limit(ctx, "tunnelSignalV2", { key: apiKey });
    if (!rl.ok) return rateLimitResponse(rl.retryAfter);

    return executeAction(
      async () => {
        try {
          await ctx.runMutation(internal.tunnels.storeAgentSignal, {
            tunnelId,
            userId: user.userId,
            offer: body.offer,
            candidates: body.candidates,
          });
        } catch (error) {
          rethrowTunnelApiError(error);
        }
      },
      () => jsonResponse({ ok: true }),
    );
  }),
});

http.route({
  pathPrefix: "/api/v1/tunnels/",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const url = new URL(request.url);
    const tunnelId = url.pathname.slice("/api/v1/tunnels/".length).replace(/\/$/, "");
    if (!tunnelId || !isValidTunnelId(tunnelId)) return errorResponse("Invalid tunnel ID", 400);

    const user = await authenticateApiKey(ctx, apiKey);
    const rl = await rateLimiter.limit(ctx, "closeTunnelV2", { key: apiKey });
    if (!rl.ok) return rateLimitResponse(rl.retryAfter);

    return executeAction(
      async () => {
        try {
          await ctx.runMutation(internal.tunnels.closeTunnel, {
            tunnelId,
            userId: user.userId,
          });
        } catch (error) {
          rethrowTunnelApiError(error);
        }
      },
      () => jsonResponse({ closed: true }),
    );
  }),
});

export default http;
