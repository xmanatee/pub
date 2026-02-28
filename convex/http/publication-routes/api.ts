import { httpRouter } from "convex/server";
import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import {
  ApiError,
  authenticateAndRateLimit,
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
} from "../shared";

export function registerPublicationApiRoutes(http: ReturnType<typeof httpRouter>): void {
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
}
