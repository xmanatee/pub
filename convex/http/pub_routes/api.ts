import { httpRouter } from "convex/server";
import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { rateLimiter } from "../../rateLimits";
import {
  ApiError,
  authenticateAndRateLimit,
  authenticateApiKey,
  corsHeaders,
  errorResponse,
  executeAction,
  generateSlug,
  getApiKey,
  getPublicUrl,
  INVALID_SLUG_MESSAGE,
  inferContentType,
  isValidSlug,
  jsonResponse,
  MAX_CONTENT_SIZE,
  MAX_EXPIRY_MS,
  MAX_TITLE_LENGTH,
  parseExpiresIn,
  parseSlugFromRequest,
  rateLimitResponse,
  rethrowLiveApiError,
  rethrowPubLimitError,
} from "../shared";

export function registerPubApiRoutes(http: ReturnType<typeof httpRouter>): void {
  const corsPreflightHandler = httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  });

  // -- CORS preflight -------------------------------------------------------

  http.route({ path: "/api/v1/pubs", method: "OPTIONS", handler: corsPreflightHandler });
  http.route({ pathPrefix: "/api/v1/pubs/", method: "OPTIONS", handler: corsPreflightHandler });

  // -- POST /api/v1/pubs  (create) ------------------------------------------

  http.route({
    path: "/api/v1/pubs",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      let body: {
        content?: string;
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

      if (body.content && body.content.length > MAX_CONTENT_SIZE) {
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

      const auth = await authenticateAndRateLimit(ctx, apiKey, "createPub");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const contentType = body.content
            ? inferContentType(body.filename ?? "file.txt")
            : undefined;
          const finalSlug = body.slug || generateSlug();

          const existing = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug: finalSlug });
          if (existing) throw new ApiError("Slug already taken", 409);

          try {
            await ctx.runMutation(internal.pubs.createPub, {
              userId: auth.userId,
              slug: finalSlug,
              contentType,
              content: body.content,
              title: body.title,
              isPublic: body.isPublic ?? false,
              expiresAt,
            });
          } catch (error) {
            rethrowPubLimitError(error);
          }

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

  // -- GET /api/v1/pubs  (list) ---------------------------------------------

  http.route({
    path: "/api/v1/pubs",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const url = new URL(request.url);
      const cursor = url.searchParams.get("cursor") || undefined;
      const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);

      const auth = await authenticateAndRateLimit(ctx, apiKey, "listPubs");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const result = await ctx.runQuery(internal.pubs.listByUserInternal, {
            userId: auth.userId,
            cursor,
            limit,
          });

          const lives = await ctx.runQuery(internal.pubs.listLivesByUserInternal, {
            userId: auth.userId,
          });
          const liveMap = new Map(lives.map((s) => [s.slug, s]));

          return {
            pubs: result.pubs.map((p) => {
              const live = liveMap.get(p.slug);
              return {
                slug: p.slug,
                contentType: p.contentType,
                title: p.title,
                isPublic: p.isPublic,
                expiresAt: p.expiresAt,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                live: live
                  ? {
                      status: live.status,
                      hasConnection: live.hasConnection,
                      expiresAt: live.expiresAt,
                    }
                  : null,
              };
            }),
            cursor: result.isDone ? undefined : result.cursor,
            hasMore: !result.isDone,
          };
        },
        (result) => jsonResponse(result),
      );
    }),
  });

  // -- GET /api/v1/pubs/:slug  (get) ----------------------------------------

  http.route({
    pathPrefix: "/api/v1/pubs/",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const url = new URL(request.url);
      const pathAfterPubs = url.pathname.slice("/api/v1/pubs/".length).replace(/\/$/, "");
      const pathParts = pathAfterPubs.split("/");

      // GET /api/v1/pubs/:slug/live
      if (pathParts.length === 2 && pathParts[1] === "live") {
        const slug = pathParts[0];
        if (!isValidSlug(slug)) return errorResponse("Invalid slug", 400);

        const user = await authenticateApiKey(ctx, apiKey);
        const rl = await rateLimiter.limit(ctx, "readLive", { key: apiKey });
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        return executeAction(
          async () => {
            const live = await ctx.runQuery(internal.pubs.getLiveBySlugInternal, { slug });
            if (!live || live.userId !== user.userId) {
              throw new ApiError("Live not found", 404);
            }
            return {
              slug: live.slug,
              status: live.status,
              browserOffer: live.browserOffer,
              agentAnswer: live.agentAnswer,
              agentCandidates: live.agentCandidates,
              browserCandidates: live.browserCandidates,
              createdAt: live.createdAt,
              expiresAt: live.expiresAt,
            };
          },
          (live) => jsonResponse({ live }),
        );
      }

      // GET /api/v1/pubs/:slug
      if (pathParts.length !== 1) return errorResponse("Invalid path", 400);

      const slug = parseSlugFromRequest(request, "/api/v1/pubs/");
      if (slug instanceof Response) return slug;

      const auth = await authenticateAndRateLimit(ctx, apiKey, "readPub");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const pub = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug });
          if (!pub || pub.userId !== auth.userId) throw new ApiError("Pub not found", 404);

          const live = await ctx.runQuery(internal.pubs.getLiveBySlugInternal, { slug });

          return {
            slug: pub.slug,
            contentType: pub.contentType,
            content: pub.content,
            title: pub.title,
            isPublic: pub.isPublic,
            expiresAt: pub.expiresAt,
            createdAt: pub.createdAt,
            updatedAt: pub.updatedAt,
            live: live
              ? {
                  status: live.status,
                  hasConnection: !!live.agentAnswer,
                  expiresAt: live.expiresAt,
                }
              : null,
          };
        },
        (pub) => jsonResponse({ pub }),
      );
    }),
  });

  // -- PATCH /api/v1/pubs/:slug  (update) -----------------------------------

  http.route({
    pathPrefix: "/api/v1/pubs/",
    method: "PATCH",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const url = new URL(request.url);
      const pathAfterPubs = url.pathname.slice("/api/v1/pubs/".length).replace(/\/$/, "");
      const pathParts = pathAfterPubs.split("/");

      if (pathParts.length !== 1) return errorResponse("Invalid path", 400);

      const slug = parseSlugFromRequest(request, "/api/v1/pubs/");
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

      const auth = await authenticateAndRateLimit(ctx, apiKey, "updatePub");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const pub = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug });
          if (!pub || pub.userId !== auth.userId) throw new ApiError("Pub not found", 404);

          if (body.slug && body.slug !== pub.slug) {
            const existing = await ctx.runQuery(internal.pubs.getBySlugInternal, {
              slug: body.slug,
            });
            if (existing) throw new ApiError("Slug already taken", 409);
          }

          const contentType = body.filename ? inferContentType(body.filename) : undefined;

          await ctx.runMutation(internal.pubs.updatePub, {
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

  // -- DELETE /api/v1/pubs/:slug  (delete pub) ------------------------------
  // -- DELETE /api/v1/pubs/:slug/live  (close live) ------------------------

  http.route({
    pathPrefix: "/api/v1/pubs/",
    method: "DELETE",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const url = new URL(request.url);
      const pathAfterPubs = url.pathname.slice("/api/v1/pubs/".length).replace(/\/$/, "");
      const pathParts = pathAfterPubs.split("/");

      // DELETE /api/v1/pubs/:slug/live
      if (pathParts.length === 2 && pathParts[1] === "live") {
        const slug = pathParts[0];
        if (!isValidSlug(slug)) return errorResponse("Invalid slug", 400);

        const user = await authenticateApiKey(ctx, apiKey);
        const rl = await rateLimiter.limit(ctx, "closeLive", { key: apiKey });
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        return executeAction(
          async () => {
            try {
              await ctx.runMutation(internal.pubs.closeLive, {
                slug,
                userId: user.userId,
              });
            } catch (error) {
              rethrowLiveApiError(error);
            }
          },
          () => jsonResponse({ closed: true }),
        );
      }

      // DELETE /api/v1/pubs/:slug
      if (pathParts.length !== 1) return errorResponse("Invalid path", 400);

      const slug = parseSlugFromRequest(request, "/api/v1/pubs/");
      if (slug instanceof Response) return slug;

      const auth = await authenticateAndRateLimit(ctx, apiKey, "deletePub");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const pub = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug });
          if (!pub || pub.userId !== auth.userId) throw new ApiError("Pub not found", 404);
          await ctx.runMutation(internal.pubs.deletePub, { id: pub._id, userId: auth.userId });
        },
        () => jsonResponse({ deleted: true }),
      );
    }),
  });
}
