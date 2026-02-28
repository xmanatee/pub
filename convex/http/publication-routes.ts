import { httpRouter } from "convex/server";
import { registerPublicationApiRoutes } from "./publication-routes/api";
import { registerPublicationContentRoutes } from "./publication-routes/content";

export function registerPublicationRoutes(http: ReturnType<typeof httpRouter>): void {
  registerPublicationApiRoutes(http);
  registerPublicationContentRoutes(http);
}
