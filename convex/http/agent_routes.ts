import { httpRouter } from "convex/server";
import { parseAgentPresenceBody, parseAgentSignalBody } from "../../shared/live-api-core";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import {
  ApiError,
  authenticateAgentAndRateLimit,
  corsPreflightHandler,
  errorResponse,
  executeAction,
  jsonResponse,
  rethrowLiveApiError,
} from "./shared";

export function registerAgentRoutes(http: ReturnType<typeof httpRouter>): void {
  function rethrowPresenceApiError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("API key already in use")) {
      throw new ApiError(message, 409, "presence_api_key_in_use");
    }
    if (message.includes("Not online")) {
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
      const auth = await authenticateAgentAndRateLimit(ctx, request, "presenceOnline");
      if (auth instanceof Response) return auth;

      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.presence.goOnline, {
              userId: auth.userId,
              apiKeyId: auth.apiKeyId,
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
      const auth = await authenticateAgentAndRateLimit(ctx, request, "presenceHeartbeat");
      if (auth instanceof Response) return auth;

      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.presence.heartbeat, {
              apiKeyId: auth.apiKeyId,
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
      const auth = await authenticateAgentAndRateLimit(ctx, request, "presenceOffline");
      if (auth instanceof Response) return auth;

      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      return executeAction(
        async () => {
          await ctx.runMutation(internal.presence.goOffline, {
            apiKeyId: auth.apiKeyId,
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
      const auth = await authenticateAgentAndRateLimit(ctx, request, "agentPollLive");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const url = new URL(request.url);
          const daemonSessionId = url.searchParams.get("daemonSessionId")?.trim();
          let hostId: Id<"hosts"> | undefined;
          if (daemonSessionId) {
            const host = await ctx.runQuery(internal.presence.getHostByApiKeySession, {
              apiKeyId: auth.apiKeyId,
              daemonSessionId,
            });
            if (!host) return { live: null };
            hostId = host._id;
          }

          const result = await ctx.runQuery(internal.connections.getConnectionForHost, {
            userId: auth.userId,
            hostId,
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
      const auth = await authenticateAgentAndRateLimit(ctx, request, "signalLive");
      if (auth instanceof Response) return auth;

      let body: ReturnType<typeof parseAgentSignalBody>;
      try {
        body = parseAgentSignalBody(await request.json());
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }
      if (!body.ok) return errorResponse(body.error, 400);

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.connections.signalConnection, {
              slug: body.value.slug,
              userId: auth.userId,
              apiKeyId: auth.apiKeyId,
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
    }),
  });

  // PUT /api/v1/agent/telegram-bot
  http.route({
    path: "/api/v1/agent/telegram-bot",
    method: "PUT",
    handler: httpAction(async (ctx, request) => {
      const auth = await authenticateAgentAndRateLimit(ctx, request, "telegramBotUpdate");
      if (auth instanceof Response) return auth;

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

      return executeAction(
        async () => {
          await ctx.runMutation(internal.telegramBots.upsertBotToken, {
            userId: auth.userId,
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
      const auth = await authenticateAgentAndRateLimit(ctx, request, "telegramBotUpdate");
      if (auth instanceof Response) return auth;

      let body: { botUsername?: unknown };
      try {
        body = await request.json();
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      const botUsername = typeof body.botUsername === "string" ? body.botUsername.trim() : "";
      if (!botUsername) return errorResponse("Missing botUsername", 400);

      return executeAction(
        async () => {
          await ctx.runMutation(internal.telegramBots.deleteBotTokenByUsername, {
            userId: auth.userId,
            botUsername,
          });
        },
        () => jsonResponse({ deleted: true }),
      );
    }),
  });

  // POST /api/v1/agent/tunnel
  http.route({
    path: "/api/v1/agent/tunnel",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const auth = await authenticateAgentAndRateLimit(ctx, request, "registerTunnel");
      if (auth instanceof Response) return auth;

      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      return executeAction(
        async () => {
          const host = await ctx.runQuery(internal.presence.getHostByApiKeySession, {
            apiKeyId: auth.apiKeyId,
            daemonSessionId: body.daemonSessionId,
          });
          if (!host) throw new ApiError("Host not online", 409);

          const result = await ctx.runMutation(internal.tunnels.registerTunnel, {
            userId: auth.userId,
            hostId: host._id,
          });
          return result;
        },
        (result) => jsonResponse(result, 201),
      );
    }),
  });

  // DELETE /api/v1/agent/tunnel
  http.route({
    path: "/api/v1/agent/tunnel",
    method: "DELETE",
    handler: httpAction(async (ctx, request) => {
      const auth = await authenticateAgentAndRateLimit(ctx, request, "closeTunnel");
      if (auth instanceof Response) return auth;

      const body = await readPresenceBody(request);
      if (body instanceof Response) return body;

      return executeAction(
        async () => {
          const host = await ctx.runQuery(internal.presence.getHostByApiKeySession, {
            apiKeyId: auth.apiKeyId,
            daemonSessionId: body.daemonSessionId,
          });
          if (!host) return;
          await ctx.runMutation(internal.tunnels.closeTunnel, { hostId: host._id });
        },
        () => jsonResponse({ closed: true }),
      );
    }),
  });

  // DELETE /api/v1/agent/live
  http.route({
    path: "/api/v1/agent/live",
    method: "DELETE",
    handler: httpAction(async (ctx, request) => {
      const auth = await authenticateAgentAndRateLimit(ctx, request, "closeLive");
      if (auth instanceof Response) return auth;

      return executeAction(
        async () => {
          const url = new URL(request.url);
          const daemonSessionId = url.searchParams.get("daemonSessionId")?.trim();
          let hostId: Id<"hosts"> | undefined;
          if (daemonSessionId) {
            const host = await ctx.runQuery(internal.presence.getHostByApiKeySession, {
              apiKeyId: auth.apiKeyId,
              daemonSessionId,
            });
            if (!host) return;
            hostId = host._id;
          }

          const active = await ctx.runQuery(internal.connections.getConnectionForHost, {
            userId: auth.userId,
            hostId,
          });
          if (!active) return;
          try {
            await ctx.runMutation(internal.connections.closeConnection, {
              slug: active.slug,
              userId: auth.userId,
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
