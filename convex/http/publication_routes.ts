import { httpRouter } from "convex/server";
import { registerPublicationApiRoutes } from "./publication_routes/api";
import { registerPublicationContentRoutes } from "./publication_routes/content";

export function registerPublicationRoutes(http: ReturnType<typeof httpRouter>): void {
  registerPublicationApiRoutes(http);
  registerPublicationContentRoutes(http);
}
