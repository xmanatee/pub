import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { RootLayoutPage, RootRouteErrorPage } from "~/features/app-shell/page/root-layout-page";
import type { AuthState } from "~/lib/route-guards";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  auth: AuthState;
}>()({
  component: RootLayoutPage,
  errorComponent: RootRouteErrorPage,
});
