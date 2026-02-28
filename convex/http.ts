import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerPublicationRoutes } from "./http/publication-routes";
import {
  corsHeaders,
  errorResponse,
  extractSlugFromPath,
  getApiKey,
  getOgCardData,
  jsonResponse,
  mapTunnelError,
} from "./http/shared";
import { registerTunnelRoutes } from "./http/tunnel-routes";

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
};

export default http;
