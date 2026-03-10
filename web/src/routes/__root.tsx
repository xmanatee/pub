import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { RootLayoutPage, RootRouteErrorPage } from "~/features/app-shell/page/root-layout-page";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootLayoutPage,
  errorComponent: RootRouteErrorPage,
});
