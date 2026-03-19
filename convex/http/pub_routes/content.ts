import { httpRouter } from "convex/server";
import { Feed } from "feed";
import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { rateLimiter } from "../../rateLimits";
import { escapeXml, truncate } from "../../utils";
import {
  buildOgTags,
  contentSecurityHeaders,
  errorResponse,
  getOgCardData,
  getPublicUrl,
  parseSlugFromRequest,
  rateLimitResponse,
} from "../shared";
import { buildPreviewSnapshotScript, injectIntoHead } from "./preview_snapshot";

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
      if (!pub || !pub.isPublic || !pub.content) {
        return new Response("Not found", { status: 404 });
      }

      const isPreview = new URL(request.url).searchParams.get("preview") === "1";
      if (!isPreview) {
        await ctx.runMutation(internal.analytics.recordView, { slug });
      }

      const injection = isPreview ? buildPreviewSnapshotScript() : buildOgTags(pub);
      const content = injectIntoHead(pub.content, injection);
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          ...contentSecurityHeaders(),
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
      const og = getOgCardData(pub?.isPublic ? pub : null, slug);

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
  <rect x="80" y="240" width="${og.badgeText.length * 16 + 32}" height="40" rx="8" fill="${og.badgeColor}" opacity="0.2"/>
  <text x="96" y="268" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="${og.badgeColor}">${og.badgeText}</text>
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
          description: pub.description || pub.title || pub.slug,
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
