import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerAgentRoutes } from "./http/agent_routes";
import { registerPubRoutes } from "./http/pub_routes";

const http = httpRouter();

auth.addHttpRoutes(http);
registerPubRoutes(http);
registerAgentRoutes(http);

export default http;
