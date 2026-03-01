import { httpRouter } from "convex/server";
import { Feed } from "feed";
import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { rateLimiter } from "../../rateLimits";
import {
  buildOgTags,
  contentSecurityHeaders,
  errorResponse,
  escapeHtmlAttr,
  escapeXml,
  getOgCardData,
  getPublicUrl,
  MIME_TYPES,
  parseSlugFromRequest,
  rateLimitResponse,
  truncate,
} from "../shared";

export function registerPubContentRoutes(http: ReturnType<typeof httpRouter>): void {
  http.route({
    pathPrefix: "/serve/",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const slug = parseSlugFromRequest(request, "/serve/");
      if (slug instanceof Response) return slug;

      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const rl = await rateLimiter.limit(ctx, "servePub", { key: clientIp });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      const pub = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug });
      if (!pub || !pub.isPublic || !pub.content || !pub.contentType) {
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
            ...contentSecurityHeaders("text/html"),
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
            ...contentSecurityHeaders(mimeType),
          },
        });
      }

      const mimeType = MIME_TYPES[pub.contentType];

      return new Response(pub.content, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=60",
          ...contentSecurityHeaders(mimeType),
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

      const pub = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug });
      const og = getOgCardData(
        pub?.contentType ? { ...pub, contentType: pub.contentType } : null,
        slug,
      );

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

      const pubs = await ctx.runQuery(internal.pubs.listPublicByUserInternal, {
        userId,
        limit: 50,
      });

      const feed = new Feed({
        title: "pub.blue",
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
          description: `${pub.contentType ?? "text"} pub`,
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
