import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

// Register OAuth callback routes for @convex-dev/auth (GitHub, Google)
auth.addHttpRoutes(http);
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HTML_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src https: http: data:",
  "font-src https: http: data:",
  "media-src https: http: data:",
  "style-src 'unsafe-inline' https: http:",
  "script-src 'unsafe-inline' 'unsafe-eval' https: http:",
  "connect-src https: http: wss:",
  "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads",
].join("; ");
const DEFAULT_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

function corsHeaders() {
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
    ...baseSecurityHeaders(),
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Security-Policy": mimeType.startsWith("text/html") ? HTML_CSP : DEFAULT_CSP,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...baseSecurityHeaders() },
  });
}

function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}

function getApiKey(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  text: "text/plain; charset=utf-8",
};

// OPTIONS handler for CORS
http.route({
  path: "/api/v1/publish",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }),
});

http.route({
  path: "/api/v1/publications",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }),
});

// POST /api/v1/publish — publish content
http.route({
  path: "/api/v1/publish",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    let body: {
      filename: string;
      content: string;
      title?: string;
      slug?: string;
      isPublic?: boolean;
    };

    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    if (!body.filename || !body.content) {
      return errorResponse("Missing required fields: filename, content", 400);
    }
    if (body.slug && !isValidSlug(body.slug)) {
      return errorResponse(
        "Invalid slug format. Use 1-64 chars: letters, numbers, dot, dash, or underscore.",
        400,
      );
    }

    try {
      const result = await ctx.runAction(api.publications.publish, {
        apiKey,
        filename: body.filename,
        content: body.content,
        title: body.title,
        slug: body.slug,
        isPublic: body.isPublic,
      });

      const siteUrl = process.env.CONVEX_SITE_URL || request.url;
      const baseUrl = new URL(siteUrl).origin;

      return jsonResponse({
        slug: result.slug,
        updated: result.updated,
        url: `${baseUrl}/serve/${encodeURIComponent(result.slug)}`,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Internal error";
      return errorResponse(message, 400);
    }
  }),
});

// GET /api/v1/publications — list publications, or get single if ?slug= is set
http.route({
  path: "/api/v1/publications",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (slug && !isValidSlug(slug)) {
      return errorResponse("Invalid slug format", 400);
    }

    try {
      if (slug) {
        const pub = await ctx.runAction(api.publications.getViaApi, {
          apiKey,
          slug,
        });
        return jsonResponse({ publication: pub });
      }
      const pubs = await ctx.runAction(api.publications.listViaApi, { apiKey });
      return jsonResponse({ publications: pubs });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Internal error";
      return errorResponse(message, 400);
    }
  }),
});

// PATCH /api/v1/publications — update publication metadata
http.route({
  path: "/api/v1/publications",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    let body: { slug: string; title?: string; isPublic?: boolean };
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    if (!body.slug) {
      return errorResponse("Missing required field: slug", 400);
    }
    if (!isValidSlug(body.slug)) {
      return errorResponse("Invalid slug format", 400);
    }

    try {
      const result = await ctx.runAction(api.publications.updateViaApi, {
        apiKey,
        slug: body.slug,
        title: body.title,
        isPublic: body.isPublic,
      });
      return jsonResponse(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Internal error";
      return errorResponse(message, 400);
    }
  }),
});

// DELETE /api/v1/publications — delete a publication (slug in query param)
http.route({
  path: "/api/v1/publications",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const apiKey = getApiKey(request);
    if (!apiKey) return errorResponse("Missing API key", 401);

    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return errorResponse("Missing slug parameter", 400);
    if (!isValidSlug(slug)) return errorResponse("Invalid slug format", 400);

    try {
      await ctx.runAction(api.publications.unpublish, { apiKey, slug });
      return jsonResponse({ deleted: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Internal error";
      return errorResponse(message, 400);
    }
  }),
});

// GET /serve/:slug — serve raw content with proper MIME type
http.route({
  pathPrefix: "/serve/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const rawSlug = url.pathname.replace("/serve/", "").replace(/\/$/, "");
    if (!rawSlug) {
      return errorResponse("Missing slug", 400);
    }

    let slug: string;
    try {
      slug = decodeURIComponent(rawSlug);
    } catch {
      return errorResponse("Invalid slug encoding", 400);
    }
    if (!isValidSlug(slug)) {
      return errorResponse("Invalid slug format", 400);
    }

    const pub = await ctx.runQuery(api.publications.getBySlug, { slug });
    if (!pub) {
      return new Response("Not found", { status: 404 });
    }

    const mimeType = MIME_TYPES[pub.contentType] || "text/plain; charset=utf-8";

    return new Response(pub.content, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=60",
        ...publicationSecurityHeaders(mimeType),
        ...corsHeaders(),
      },
    });
  }),
});

export default http;
