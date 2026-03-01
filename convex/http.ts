import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerPublicationRoutes } from "./http/publication_routes";
import {
  corsHeaders,
  errorResponse,
  extractSlugFromPath,
  getApiKey,
  getOgCardData,
  jsonResponse,
  mapTunnelError,
  shouldTouchApiKey,
} from "./http/shared";
import { registerTunnelRoutes } from "./http/tunnel_routes";

const http = httpRouter();

auth.addHttpRoutes(http);
registerPublicationRoutes(http);
registerTunnelRoutes(http);

export {
  corsHeaders,
  errorResponse,
  extractSlugFromPath,
  getApiKey,
  getOgCardData,
  jsonResponse,
  mapTunnelError,
  shouldTouchApiKey,
};

export default http;
