import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

// Register OAuth callback routes for @convex-dev/auth (GitHub, Google)
auth.addHttpRoutes(http);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}

function getApiKey(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  const url = new URL(request.url);
  return url.searchParams.get("key");
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
        url: `${baseUrl}/serve/${result.slug}`,
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
    const slug = url.pathname.replace("/serve/", "").replace(/\/$/, "");
    if (!slug) {
      return errorResponse("Missing slug", 400);
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
        ...corsHeaders(),
      },
    });
  }),
});

export default http;
