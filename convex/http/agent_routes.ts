import { httpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import {
  authenticateApiKey,
  corsHeaders,
  errorResponse,
  executeAction,
  getApiKey,
  jsonResponse,
  rateLimitResponse,
  rethrowLiveApiError,
} from "./shared";

export function registerAgentRoutes(http: ReturnType<typeof httpRouter>): void {
  const corsPreflightHandler = httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  });

  http.route({ pathPrefix: "/api/v1/agent/", method: "OPTIONS", handler: corsPreflightHandler });

  // POST /api/v1/agent/online
  http.route({
    path: "/api/v1/agent/online",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "presenceHeartbeat", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          await ctx.runMutation(internal.presence.goOnline, { userId: user.userId });
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

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "presenceHeartbeat", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          await ctx.runMutation(internal.presence.heartbeat, { userId: user.userId });
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

      const user = await authenticateApiKey(ctx, apiKey);

      return executeAction(
        async () => {
          await ctx.runMutation(internal.presence.goOffline, { userId: user.userId });
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
          const pending = await ctx.runQuery(internal.pubs.getPendingLiveForAgent, {
            userId: user.userId,
          });
          if (!pending) {
            const active = await ctx.runQuery(internal.pubs.getActiveLiveForAgent, {
              userId: user.userId,
            });
            return { live: active };
          }
          return { live: pending };
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

      let body: { slug: string; answer?: string; candidates?: string[]; agentName?: string };
      try {
        body = await request.json();
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      if (!body.slug) return errorResponse("Missing slug", 400);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "signalLive", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.pubs.storeAgentAnswer, {
              slug: body.slug,
              userId: user.userId,
              answer: body.answer,
              candidates: body.candidates,
              agentName: body.agentName,
            });
          } catch (error) {
            rethrowLiveApiError(error);
          }
        },
        () => jsonResponse({ ok: true }),
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
          const active = await ctx.runQuery(internal.pubs.getActiveLiveForAgent, {
            userId: user.userId,
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
