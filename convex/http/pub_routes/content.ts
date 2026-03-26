import { httpRouter } from "convex/server";
import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { rateLimiter } from "../../rateLimits";
import { escapeXml, mimeFromPath, SYSTEM_FILE_PREFIX, truncate } from "../../utils";
import {
  buildSupplementalOgTags,
  contentSecurityHeaders,
  getOgCardData,
  injectIntoHead,
  parseServeRequest,
  parseSlugFromRequest,
  rateLimitResponse,
} from "../shared";

const PUB_SDK_SOURCE = `// pub.blue SDK — do not edit
export const command = (name, args, opts) => window.pub.command(name, args, opts);
export const cancelCommand = (id, reason) => window.pub.cancelCommand(id, reason);
export const commands = window.pub.commands;
`;

const SYSTEM_FILES: Record<string, { content: string; mime: string }> = {
  "_pub/api.js": { content: PUB_SDK_SOURCE, mime: "text/javascript; charset=utf-8" },
};

export function registerPubContentRoutes(http: ReturnType<typeof httpRouter>): void {
  http.route({
    pathPrefix: "/serve/",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const parsed = parseServeRequest(request);
      if (parsed instanceof Response) return parsed;
      const { slug, filePath } = parsed;

      if (filePath.startsWith(SYSTEM_FILE_PREFIX)) {
        const entry = SYSTEM_FILES[filePath];
        if (!entry) return new Response("Not found", { status: 404 });
        return new Response(entry.content, {
          status: 200,
          headers: {
            "Content-Type": entry.mime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const rl = await rateLimiter.limit(ctx, "servePub", { key: clientIp });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      const pub = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug });
      if (!pub || !pub.isPublic) {
        return new Response("Not found", { status: 404 });
      }

      const file = await ctx.runQuery(internal.pubFiles.getFile, {
        pubId: pub._id,
        path: filePath,
      });
      if (!file) {
        return new Response("Not found", { status: 404 });
      }

      const isIndex = filePath === "index.html";
      if (isIndex) {
        await ctx.runMutation(internal.analytics.recordView, { slug });
      }

      const content = isIndex
        ? injectIntoHead(file.content, buildSupplementalOgTags(pub, file.content))
        : file.content;

      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": mimeFromPath(filePath),
          "Cache-Control": isIndex ? "public, max-age=60" : "public, max-age=3600",
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
}
