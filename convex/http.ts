import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerAgentRoutes } from "./http/agent_routes";
import { registerPubRoutes } from "./http/pub_routes";
import { corsPreflightHandler } from "./http/shared";
import { getIceServers } from "./turn";

const http = httpRouter();

auth.addHttpRoutes(http);
registerPubRoutes(http);
registerAgentRoutes(http);

http.route({ path: "/api/v1/ice-servers", method: "GET", handler: getIceServers });
http.route({ path: "/api/v1/ice-servers", method: "OPTIONS", handler: corsPreflightHandler });

export default http;
