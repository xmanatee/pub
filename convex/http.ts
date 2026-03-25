import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerAgentRoutes } from "./http/agent_routes";
import { registerPubRoutes } from "./http/pub_routes";
import { corsPreflightHandler } from "./http/shared";
import { debugTurnConfig, getIceServers } from "./turn";

const http = httpRouter();

auth.addHttpRoutes(http);
registerPubRoutes(http);
registerAgentRoutes(http);

http.route({ path: "/api/v1/ice-servers", method: "GET", handler: getIceServers });
http.route({ path: "/api/v1/ice-servers", method: "OPTIONS", handler: corsPreflightHandler });
http.route({ path: "/debug/turn", method: "GET", handler: debugTurnConfig });

export default http;
