import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { registerAgentRoutes } from "./http/agent_routes";
import { registerPubRoutes } from "./http/pub_routes";
import {
  authenticateAgentAndRateLimit,
  corsPreflightHandler,
  errorResponse,
  jsonResponse,
} from "./http/shared";
import { getIceServers } from "./turn";

const http = httpRouter();

auth.addHttpRoutes(http);
registerPubRoutes(http);
registerAgentRoutes(http);

http.route({ path: "/api/v1/ice-servers", method: "GET", handler: getIceServers });
http.route({ path: "/api/v1/ice-servers", method: "OPTIONS", handler: corsPreflightHandler });

http.route({
  path: "/api/v1/tunnel/validate",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim();
    if (!token) return errorResponse("Missing token", 400);

    const result = await ctx.runQuery(internal.tunnels.getTunnelByToken, { token });
    if (!result) return errorResponse("Invalid token", 401);

    return jsonResponse({ userId: result.userId, hostId: result.hostId });
  }),
});

http.route({
  path: "/api/v1/tunnel/validate-daemon",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateAgentAndRateLimit(ctx, request, "validateTunnel");
    if (auth instanceof Response) return auth;

    let body: { daemonSessionId?: unknown };
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const daemonSessionId =
      typeof body.daemonSessionId === "string" ? body.daemonSessionId.trim() : "";
    if (!daemonSessionId) return errorResponse("Missing daemonSessionId", 400);

    const host = await ctx.runQuery(internal.presence.getHostByApiKeySession, {
      apiKeyId: auth.apiKeyId,
      daemonSessionId,
    });
    if (!host) return errorResponse("Host not online", 409);

    return jsonResponse({ userId: auth.userId, apiKeyId: auth.apiKeyId, hostId: host._id });
  }),
});

http.route({ pathPrefix: "/api/v1/tunnel/", method: "OPTIONS", handler: corsPreflightHandler });

export default http;
