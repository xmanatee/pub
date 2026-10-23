import { ConvexQueryClient } from "@convex-dev/react-query";
import { MutationCache, notifyManager, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { getConvexUrl } from "./lib/convex-url";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  notifyManager.setScheduler(window.requestAnimationFrame);
  const convexClient = new ConvexReactClient(getConvexUrl());
  const convexQueryClient = new ConvexQueryClient(convexClient);

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
    mutationCache: new MutationCache({
      onError: (error) => {
        console.error("Mutation error:", error.message);
      },
    }),
  });
  convexQueryClient.connect(queryClient);

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    context: {
      queryClient,
      auth: undefined as never, // Provided at runtime by RouterProvider in main.tsx
    },
    scrollRestoration: true,
  });

  return { router, queryClient, convexClient };
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>["router"];
  }
}
