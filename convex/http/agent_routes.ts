import { httpRouter } from "convex/server";
import { parseAgentPresenceBody, parseAgentSignalBody } from "../../shared/live-api-core";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import {
  ApiError,
  authenticateApiKey,
  corsPreflightHandler,
  errorResponse,
  executeAction,
  getApiKey,
  jsonResponse,
  rateLimitResponse,
  rethrowLiveApiError,
} from "./shared";

export function registerAgentRoutes(http: ReturnType<typeof httpRouter>): void {
  function rethrowPresenceApiError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "API key already in use") {
      throw new ApiError(message, 409, "presence_api_key_in_use");
    }
    if (message === "Not online") {
      throw new ApiError(message, 409, "presence_not_online");
    }
    throw error;
  }

  async function readPresenceBody(
    request: Request,
  ): Promise<{ daemonSessionId: string; agentName?: string } | Response> {
    try {
      const parsed = parseAgentPresenceBody(await request.json());
      if (!parsed.ok) return errorResponse(parsed.error, 400);
      return parsed.value;
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
  }

  http.route({ pathPrefix: "/api/v1/agent/", method: "OPTIONS", handler: corsPreflightHandler });

  // POST /api/v1/agent/online
  http.route({
    path: "/api/v1/agent/online",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);
      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "presenceHeartbeat", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.presence.goOnline, {
              userId: user.userId,
              apiKeyId: user.apiKeyId,
              daemonSessionId: body.daemonSessionId,
              agentName: body.agentName,
            });
          } catch (error) {
            rethrowPresenceApiError(error);
          }
        },
        () => jsonResponse({ online: true }),
      );
    }),
  });

  // POST /api/v1/agent/heartbeat
  http.route({
    path: "/api/v1/agent/heartbeat",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);
      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "presenceHeartbeat", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.presence.heartbeat, {
              apiKeyId: user.apiKeyId,
              daemonSessionId: body.daemonSessionId,
            });
          } catch (error) {
            rethrowPresenceApiError(error);
          }
        },
        () => jsonResponse({ ok: true }),
      );
    }),
  });

  // POST /api/v1/agent/offline
  http.route({
    path: "/api/v1/agent/offline",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);
      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      const user = await authenticateApiKey(ctx, apiKey);

      return executeAction(
        async () => {
          await ctx.runMutation(internal.presence.goOffline, {
            apiKeyId: user.apiKeyId,
            daemonSessionId: body.daemonSessionId,
          });
        },
        () => jsonResponse({ offline: true }),
      );
    }),
  });

  // GET /api/v1/agent/live
  http.route({
    path: "/api/v1/agent/live",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "agentPollLive", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          const url = new URL(request.url);
          const daemonSessionId = url.searchParams.get("daemonSessionId")?.trim();
          let targetPresenceId: Id<"agentPresence"> | undefined;
          if (daemonSessionId) {
            const presence = await ctx.runQuery(internal.presence.getPresenceByApiKeySession, {
              apiKeyId: user.apiKeyId,
              daemonSessionId,
            });
            if (!presence) return { live: null };
            targetPresenceId = presence._id;
          }

          const result = await ctx.runQuery(internal.pubs.getLive, {
            userId: user.userId,
            targetPresenceId,
          });
          return { live: result };
        },
        (result) => jsonResponse(result),
      );
    }),
  });

  // PATCH /api/v1/agent/live/signal
  http.route({
    path: "/api/v1/agent/live/signal",
    method: "PATCH",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      try {
        const body = parseAgentSignalBody(await request.json());
        if (!body.ok) return errorResponse(body.error, 400);

        const user = await authenticateApiKey(ctx, apiKey);
        const rl = await rateLimiter.limit(ctx, "signalLive", { key: apiKey });
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        return executeAction(
          async () => {
            try {
              await ctx.runMutation(internal.pubs.storeAgentAnswer, {
                slug: body.value.slug,
                userId: user.userId,
                apiKeyId: user.apiKeyId,
                daemonSessionId: body.value.daemonSessionId,
                answer: body.value.answer,
                candidates: body.value.candidates,
                agentName: body.value.agentName,
              });
            } catch (error) {
              rethrowLiveApiError(error);
            }
          },
          () => jsonResponse({ ok: true }),
        );
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }
    }),
  });

  // PUT /api/v1/agent/telegram-bot
  http.route({
    path: "/api/v1/agent/telegram-bot",
    method: "PUT",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      let body: { botToken?: unknown; botUsername?: unknown };
      try {
        body = await request.json();
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
      const botUsername = typeof body.botUsername === "string" ? body.botUsername.trim() : "";
      if (!botToken) return errorResponse("Missing botToken", 400);
      if (!botUsername) return errorResponse("Missing botUsername", 400);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "telegramBotUpdate", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          await ctx.runMutation(internal.telegramBots.upsertBotToken, {
            userId: user.userId,
            botToken,
            botUsername,
          });
        },
        () => jsonResponse({ ok: true }),
      );
    }),
  });

  // DELETE /api/v1/agent/telegram-bot
  http.route({
    path: "/api/v1/agent/telegram-bot",
    method: "DELETE",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "telegramBotUpdate", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          await ctx.runMutation(internal.telegramBots.deleteBotToken, {
            userId: user.userId,
          });
        },
        () => jsonResponse({ deleted: true }),
      );
    }),
  });

  // DELETE /api/v1/agent/live
  http.route({
    path: "/api/v1/agent/live",
    method: "DELETE",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "closeLive", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          const url = new URL(request.url);
          const daemonSessionId = url.searchParams.get("daemonSessionId")?.trim();
          let targetPresenceId: Id<"agentPresence"> | undefined;
          if (daemonSessionId) {
            const presence = await ctx.runQuery(internal.presence.getPresenceByApiKeySession, {
              apiKeyId: user.apiKeyId,
              daemonSessionId,
            });
            if (!presence) return;
            targetPresenceId = presence._id;
          }

          const active = await ctx.runQuery(internal.pubs.getLive, {
            userId: user.userId,
            targetPresenceId,
          });
          if (!active) return;
          try {
            await ctx.runMutation(internal.pubs.closeLive, {
              slug: active.slug,
              userId: user.userId,
            });
          } catch (error) {
            rethrowLiveApiError(error);
          }
        },
        () => jsonResponse({ closed: true }),
      );
    }),
  });
}
