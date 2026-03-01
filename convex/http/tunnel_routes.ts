import { httpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import {
  ApiError,
  authenticateApiKey,
  corsHeaders,
  errorResponse,
  executeAction,
  getApiKey,
  getPublicUrl,
  jsonResponse,
  parseExpiresIn,
  rateLimitResponse,
  rethrowTunnelApiError,
} from "./shared";

const TUNNEL_ID_PATTERN = /^[a-z0-9]{8,32}$/;
const MAX_TUNNEL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TUNNEL_EXPIRY_MS = 24 * 60 * 60 * 1000;

function isValidTunnelId(id: string): boolean {
  return TUNNEL_ID_PATTERN.test(id);
}

function generateTunnelId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function registerTunnelRoutes(http: ReturnType<typeof httpRouter>): void {
  const corsPreflightHandler = httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  });

  http.route({
    path: "/api/v1/tunnels",
    method: "OPTIONS",
    handler: corsPreflightHandler,
  });

  http.route({
    pathPrefix: "/api/v1/tunnels/",
    method: "OPTIONS",
    handler: corsPreflightHandler,
  });

  http.route({
    path: "/api/v1/tunnels",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      let body: { expiresIn?: string | number };
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      let expiresMs = DEFAULT_TUNNEL_EXPIRY_MS;
      if (body.expiresIn !== undefined) {
        const ms = parseExpiresIn(body.expiresIn);
        if (!ms || ms <= 0) return errorResponse("Invalid expiresIn value", 400);
        if (ms > MAX_TUNNEL_EXPIRY_MS) return errorResponse("Expiry cannot exceed 7 days", 400);
        expiresMs = ms;
      }

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "createTunnel", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      const tunnelId = generateTunnelId();
      const expiresAt = Date.now() + expiresMs;

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.tunnels.createTunnel, {
              userId: user.userId,
              tunnelId,
              expiresAt,
            });
          } catch (error) {
            rethrowTunnelApiError(error);
          }
          return { tunnelId, expiresAt };
        },
        (result) => {
          const url = `${getPublicUrl()}/t/${result.tunnelId}`;
          return jsonResponse({ tunnelId: result.tunnelId, url, expiresAt: result.expiresAt }, 201);
        },
      );
    }),
  });

  http.route({
    pathPrefix: "/api/v1/tunnels/",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const url = new URL(request.url);
      const path = url.pathname.slice("/api/v1/tunnels/".length).replace(/\/$/, "");

      if (!path) {
        const user = await authenticateApiKey(ctx, apiKey);
        const rl = await rateLimiter.limit(ctx, "readTunnel", { key: apiKey });
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        return executeAction(
          () => ctx.runQuery(internal.tunnels.listByUserInternal, { userId: user.userId }),
          (tunnels) => jsonResponse({ tunnels }),
        );
      }

      const pathParts = path.split("/");
      if (pathParts.length !== 1) return errorResponse("Invalid tunnel path", 400);

      const tunnelId = pathParts[0];
      if (!isValidTunnelId(tunnelId)) return errorResponse("Invalid tunnel ID", 400);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "readTunnel", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          const tunnel = await ctx.runQuery(internal.tunnels.getByTunnelIdInternal, { tunnelId });
          if (!tunnel || tunnel.userId !== user.userId) throw new ApiError("Tunnel not found", 404);
          return {
            tunnelId: tunnel.tunnelId,
            status: tunnel.status,
            agentOffer: tunnel.agentOffer,
            browserAnswer: tunnel.browserAnswer,
            agentCandidates: tunnel.agentCandidates,
            browserCandidates: tunnel.browserCandidates,
            createdAt: tunnel.createdAt,
            expiresAt: tunnel.expiresAt,
          };
        },
        (tunnel) => jsonResponse({ tunnel }),
      );
    }),
  });

  http.route({
    pathPrefix: "/api/v1/tunnels/",
    method: "PATCH",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const url = new URL(request.url);
      const pathParts = url.pathname.slice("/api/v1/tunnels/".length).split("/");
      const tunnelId = pathParts[0];
      if (!tunnelId || !isValidTunnelId(tunnelId)) return errorResponse("Invalid tunnel ID", 400);
      if (pathParts.length !== 2 || pathParts[1] !== "signal") {
        return errorResponse("Invalid tunnel signal path", 400);
      }

      let body: { offer?: string; candidates?: string[] };
      try {
        body = await request.json();
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "tunnelSignal", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.tunnels.storeAgentSignal, {
              tunnelId,
              userId: user.userId,
              offer: body.offer,
              candidates: body.candidates,
            });
          } catch (error) {
            rethrowTunnelApiError(error);
          }
        },
        () => jsonResponse({ ok: true }),
      );
    }),
  });

  http.route({
    pathPrefix: "/api/v1/tunnels/",
    method: "DELETE",
    handler: httpAction(async (ctx, request) => {
      const apiKey = getApiKey(request);
      if (!apiKey) return errorResponse("Missing API key", 401);

      const url = new URL(request.url);
      const tunnelId = url.pathname.slice("/api/v1/tunnels/".length).replace(/\/$/, "");
      if (!tunnelId || !isValidTunnelId(tunnelId)) return errorResponse("Invalid tunnel ID", 400);

      const user = await authenticateApiKey(ctx, apiKey);
      const rl = await rateLimiter.limit(ctx, "closeTunnel", { key: apiKey });
      if (!rl.ok) return rateLimitResponse(rl.retryAfter);

      return executeAction(
        async () => {
          try {
            await ctx.runMutation(internal.tunnels.closeTunnel, {
              tunnelId,
              userId: user.userId,
            });
          } catch (error) {
            rethrowTunnelApiError(error);
          }
        },
        () => jsonResponse({ closed: true }),
      );
    }),
  });
}
