import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import {
  generateSlug,
  INVALID_SLUG_MESSAGE,
  inferContentType,
  isValidSlug,
  MAX_CONTENT_SIZE,
  MAX_TITLE_LENGTH,
  MIME_TYPES,
} from "./utils";

const http = httpRouter();

auth.addHttpRoutes(http);

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

async function executeAction<T>(
  fn: () => Promise<T>,
  onSuccess: (result: T) => Response,
): Promise<Response> {
  try {
    const result = await fn();
    return onSuccess(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal error";
    return errorResponse(message, 400);
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
  if (!user) throw new Error("Invalid API key");
  await ctx.runMutation(internal.apiKeys.touchApiKey, { apiKeyId: user.apiKeyId });
  return user;
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
      return errorResponse("Content exceeds maximum size of 1MB", 400);
    }
    if (body.slug && !isValidSlug(body.slug)) {
      return errorResponse(INVALID_SLUG_MESSAGE, 400);
    }
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      return errorResponse(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`, 400);
    }

    return executeAction(
      async () => {
        const user = await authenticateApiKey(ctx, apiKey);
        const contentType = inferContentType(body.filename ?? "file.txt");
        const finalSlug = body.slug || generateSlug();

        const existing = await ctx.runQuery(internal.publications.getBySlugInternal, {
          slug: finalSlug,
        });
        if (existing) throw new Error("Slug already taken");

        await ctx.runMutation(internal.publications.createPublication, {
          userId: user.userId,
          slug: finalSlug,
          contentType,
          content: body.content,
          title: body.title,
          isPublic: body.isPublic ?? false,
        });

        return { slug: finalSlug };
      },
      (result) => {
        const publicUrl = process.env.PUB_PUBLIC_URL;
        const url = `${publicUrl ?? ""}/p/${encodeURIComponent(result.slug)}`;
        return jsonResponse({ slug: result.slug, url }, 201);
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

    return executeAction(
      async () => {
        const user = await authenticateApiKey(ctx, apiKey);
        const pubs = await ctx.runQuery(internal.publications.listByUserInternal, {
          userId: user.userId,
        });
        return pubs.map((p) => ({
          slug: p.slug,
          contentType: p.contentType,
          title: p.title,
          isPublic: p.isPublic,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
      },
      (pubs) => jsonResponse({ publications: pubs }),
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

    return executeAction(
      async () => {
        const user = await authenticateApiKey(ctx, apiKey);
        const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
        if (!pub || pub.userId !== user.userId) throw new Error("Publication not found");
        return {
          slug: pub.slug,
          contentType: pub.contentType,
          content: pub.content,
          title: pub.title,
          isPublic: pub.isPublic,
          createdAt: pub.createdAt,
          updatedAt: pub.updatedAt,
        };
      },
      (pub) => jsonResponse({ publication: pub }),
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
    };
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    if (body.content && body.content.length > MAX_CONTENT_SIZE) {
      return errorResponse("Content exceeds maximum size of 1MB", 400);
    }
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      return errorResponse(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`, 400);
    }

    return executeAction(
      async () => {
        const user = await authenticateApiKey(ctx, apiKey);
        const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
        if (!pub || pub.userId !== user.userId) throw new Error("Publication not found");

        const contentType = body.filename ? inferContentType(body.filename) : undefined;

        await ctx.runMutation(internal.publications.updatePublication, {
          id: pub._id,
          content: body.content,
          contentType,
          title: body.title,
          isPublic: body.isPublic,
        });

        return {
          slug: pub.slug,
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

    return executeAction(
      async () => {
        const user = await authenticateApiKey(ctx, apiKey);
        const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
        if (!pub || pub.userId !== user.userId) throw new Error("Publication not found");
        await ctx.runMutation(internal.publications.deletePublication, {
          id: pub._id,
          userId: user.userId,
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

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
    if (!pub || !pub.isPublic) {
      return new Response("Not found", { status: 404 });
    }

    if (pub.contentType === "markdown") {
      const { marked } = await import("marked");
      const rendered = await marked.parse(pub.content ?? "");
      const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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

    const mimeType = MIME_TYPES[pub.contentType] || "text/plain; charset=utf-8";

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

export default http;
