import { httpRouter } from "convex/server";
import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { getPublicUrl } from "../../env";
import {
  extractOgMeta,
  generateSlug,
  INVALID_SLUG_MESSAGE,
  isValidSlug,
  validateFiles,
} from "../../utils";
import {
  ApiError,
  authenticateAndRateLimit,
  corsPreflightHandler,
  errorResponse,
  executeAction,
  getApiKey,
  jsonResponse,
  parseSlugFromRequest,
  rethrowPubLimitError,
} from "../shared";

const DEFAULT_INDEX_HTML = "";

function toLegacyFiles(content: string): Record<string, string> {
  return { "index.html": content };
}

export function registerPubApiRoutes(http: ReturnType<typeof httpRouter>): void {
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
        files?: Record<string, string>;
        content?: unknown;
        slug?: string;
        title?: unknown;
        description?: unknown;
      };
      try {
        body = await request.json();
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      if ("title" in body || "description" in body) {
        return errorResponse(
          "Title and description must come from og:title and og:description in content.",
          400,
        );
      }

      if (body.files && body.content !== undefined) {
        return errorResponse("Provide either files or content, not both", 400);
      }

      if (body.content !== undefined && typeof body.content !== "string") {
        return errorResponse("Field content must be a string", 400);
      }

      const files =
        body.files ??
        (typeof body.content === "string"
          ? toLegacyFiles(body.content)
          : toLegacyFiles(DEFAULT_INDEX_HTML));

      const validation = validateFiles(files);
      if (!validation.ok) return errorResponse(validation.error, 400);

      if (body.slug && !isValidSlug(body.slug)) {
        return errorResponse(INVALID_SLUG_MESSAGE, 400);
      }

      const indexHtml = files["index.html"];
      const { title, description } = indexHtml ? extractOgMeta(indexHtml) : {};

      const auth = await authenticateAndRateLimit(ctx, apiKey, "createPub");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const finalSlug = body.slug || generateSlug();

          const existing = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug: finalSlug });
          if (existing) throw new ApiError("Slug already taken", 409);

          const pubId = await ctx
            .runMutation(internal.pubs.createPub, {
              userId: auth.userId,
              slug: finalSlug,
              title,
              description,
            })
            .catch((error) => {
              rethrowPubLimitError(error);
              throw error;
            });

          if (!pubId) throw new ApiError("Failed to create pub", 500);

          await ctx.runMutation(internal.pubFiles.writeFiles, {
            pubId,
            files: Object.entries(files).map(([path, content]) => ({ path, content })),
          });

          return { slug: finalSlug };
        },
        (result) => {
          const url = `${getPublicUrl()}/p/${encodeURIComponent(result.slug)}`;
          return jsonResponse({ slug: result.slug, url }, 201);
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

          const conns = await ctx.runQuery(internal.connections.listConnectionsByUserInternal, {
            userId: auth.userId,
          });
          const liveMap = new Map(conns.map((c) => [c.slug, c]));

          return {
            pubs: result.pubs.map((p) => {
              const live = liveMap.get(p.slug);
              return {
                slug: p.slug,
                title: p.title,
                description: p.description,
                isPublic: p.isPublic,
                fileCount: p.fileCount ?? 0,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                live: live ? { status: "active" } : null,
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

      if (pathParts.length !== 1) return errorResponse("Invalid path", 400);

      const slug = parseSlugFromRequest(request, "/api/v1/pubs/");
      if (slug instanceof Response) return slug;

      const auth = await authenticateAndRateLimit(ctx, apiKey, "readPub");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const pub = await ctx.runQuery(internal.pubs.getBySlugInternal, { slug });
          if (!pub || pub.userId !== auth.userId) throw new ApiError("Pub not found", 404);

          const live = await ctx.runQuery(internal.connections.getConnectionBySlugInternal, {
            slug,
          });

          const pubFileRows = await ctx.runQuery(internal.pubFiles.listFilesWithContent, {
            pubId: pub._id,
          });
          const files: Record<string, string> = {};
          for (const f of pubFileRows) {
            files[f.path] = f.content;
          }

          return {
            slug: pub.slug,
            content: files["index.html"],
            files,
            fileCount: pubFileRows.length,
            title: pub.title,
            description: pub.description,
            isPublic: pub.isPublic,
            createdAt: pub.createdAt,
            updatedAt: pub.updatedAt,
            live: live ? { status: "active" } : null,
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
        files?: Record<string, string>;
        content?: unknown;
        isPublic?: boolean;
        slug?: string;
        title?: unknown;
        description?: unknown;
      };
      try {
        body = await request.json();
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      if ("title" in body || "description" in body) {
        return errorResponse(
          "Title and description must come from og:title and og:description in content.",
          400,
        );
      }

      if (body.files && body.content !== undefined) {
        return errorResponse("Provide either files or content, not both", 400);
      }

      if (body.content !== undefined && typeof body.content !== "string") {
        return errorResponse("Field content must be a string", 400);
      }

      if (body.slug !== undefined) {
        if (!isValidSlug(body.slug)) return errorResponse(INVALID_SLUG_MESSAGE, 400);
      }

      const files =
        body.files ?? (typeof body.content === "string" ? toLegacyFiles(body.content) : undefined);
      if (files) {
        const validation = validateFiles(files);
        if (!validation.ok) return errorResponse(validation.error, 400);
      }

      const indexHtml = files?.["index.html"];
      const extracted = indexHtml ? extractOgMeta(indexHtml) : {};

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

          if (files) {
            await ctx.runMutation(internal.pubFiles.writeFiles, {
              pubId: pub._id,
              files: Object.entries(files).map(([path, content]) => ({ path, content })),
            });
          }

          await ctx.runMutation(internal.pubs.updatePub, {
            id: pub._id,
            title: extracted.title,
            description: extracted.description,
            isPublic: body.isPublic,
            slug: body.slug,
          });

          return {
            slug: body.slug ?? pub.slug,
            title: extracted.title ?? pub.title,
            description: extracted.description ?? pub.description,
            isPublic: body.isPublic ?? pub.isPublic,
            updatedAt: Date.now(),
          };
        },
        (result) => jsonResponse(result),
      );
    }),
  });

  // -- DELETE /api/v1/pubs/:slug  (delete pub) ------------------------------

  http.route({
    pathPrefix: "/api/v1/pubs/",
    method: "DELETE",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

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
