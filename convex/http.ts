import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerAgentRoutes } from "./http/agent_routes";
import { registerPubRoutes } from "./http/pub_routes";
import {
  corsHeaders,
  errorResponse,
  extractSlugFromPath,
  getApiKey,
  getOgCardData,
  jsonResponse,
  mapLiveError,
  shouldTouchApiKey,
} from "./http/shared";

const http = httpRouter();

auth.addHttpRoutes(http);
registerPubRoutes(http);
registerAgentRoutes(http);

export {
  corsHeaders,
  errorResponse,
  extractSlugFromPath,
  getApiKey,
  getOgCardData,
  jsonResponse,
  mapLiveError,
  shouldTouchApiKey,
};

export default http;
