import { httpRouter } from "convex/server";
import { Feed } from "feed";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import {
  ApiError,
  authenticateAndRateLimit,
  buildOgTags,
  corsHeaders,
  errorResponse,
  escapeHtmlAttr,
  escapeXml,
  executeAction,
  generateSlug,
  getApiKey,
  getOgCardData,
  getPublicUrl,
  INVALID_SLUG_MESSAGE,
  inferContentType,
  isValidSlug,
  jsonResponse,
  MAX_CONTENT_SIZE,
  MAX_EXPIRY_MS,
  MAX_TITLE_LENGTH,
  MIME_TYPES,
  parseExpiresIn,
  parseSlugFromRequest,
  publicationSecurityHeaders,
  rateLimitResponse,
  truncate,
} from "./shared";

export function registerPublicationRoutes(http: ReturnType<typeof httpRouter>): void {
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
          return new Response(
            JSON.stringify({
              publications: result.publications,
              cursor: result.cursor,
              hasMore: result.hasMore,
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } },
          );
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
}
