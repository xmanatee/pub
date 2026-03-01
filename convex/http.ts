import { httpRouter } from "convex/server";
import { auth } from "./auth";
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
