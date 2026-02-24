import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import {
  INVALID_SLUG_MESSAGE,
  isValidSlug,
  MAX_FILENAME_LENGTH,
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
      return errorResponse(INVALID_SLUG_MESSAGE, 400);
    }
    if (body.filename.length > MAX_FILENAME_LENGTH) {
      return errorResponse(
        `Filename exceeds maximum length of ${MAX_FILENAME_LENGTH} characters`,
        400,
      );
    }
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      return errorResponse(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`, 400);
    }

    return executeAction(
      () =>
        ctx.runAction(api.publications.publish, {
          apiKey,
          filename: body.filename,
          content: body.content,
          title: body.title,
          slug: body.slug,
          isPublic: body.isPublic,
        }),
      (result) => {
        const publicUrl = process.env.PUB_PUBLIC_URL;
        const url = `${publicUrl ?? ""}/p/${encodeURIComponent(result.slug)}`;
        return jsonResponse({
          slug: result.slug,
          updated: result.updated,
          url,
        });
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
    const slug = url.searchParams.get("slug");
    if (slug && !isValidSlug(slug)) {
      return errorResponse("Invalid slug format", 400);
    }

    return executeAction(
      async () => {
        if (slug) {
          const pub = await ctx.runAction(api.publications.getViaApi, { apiKey, slug });
          return { publication: pub };
        }
        const pubs = await ctx.runAction(api.publications.listViaApi, { apiKey });
        return { publications: pubs };
      },
      (result) => jsonResponse(result),
    );
  }),
});

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
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      return errorResponse(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`, 400);
    }

    return executeAction(
      () =>
        ctx.runAction(api.publications.updateViaApi, {
          apiKey,
          slug: body.slug,
          title: body.title,
          isPublic: body.isPublic,
        }),
      (result) => jsonResponse(result),
    );
  }),
});

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

    return executeAction(
      () => ctx.runAction(api.publications.unpublish, { apiKey, slug }),
      () => jsonResponse({ deleted: true }),
    );
  }),
});

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
