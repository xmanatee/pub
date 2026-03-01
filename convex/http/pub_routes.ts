import { httpRouter } from "convex/server";
import { registerPubApiRoutes } from "./pub_routes/api";
import { registerPubContentRoutes } from "./pub_routes/content";

export function registerPubRoutes(http: ReturnType<typeof httpRouter>): void {
  registerPubApiRoutes(http);
  registerPubContentRoutes(http);
}
