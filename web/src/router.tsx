import { ConvexQueryClient } from "@convex-dev/react-query";
import * as Sentry from "@sentry/react";
import { MutationCache, notifyManager, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import posthog from "posthog-js";
import { routeTree } from "./routeTree.gen";

const FALLBACK_CONVEX_URL = "https://example.convex.cloud";

export function getRouter() {
  notifyManager.setScheduler(window.requestAnimationFrame);

  const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
  if (!CONVEX_URL && import.meta.env.MODE !== "test") {
    console.error("missing envar VITE_CONVEX_URL");
  }
  const convexQueryClient = new ConvexQueryClient(CONVEX_URL ?? FALLBACK_CONVEX_URL);

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        const mutationKey = mutation.options.mutationKey
          ? String(mutation.options.mutationKey)
          : "unknown";
        Sentry.captureException(error, {
          tags: { type: "mutation_error", mutation: mutationKey },
        });
        console.error("Mutation error:", error.message);
      },
    }),
  });
  convexQueryClient.connect(queryClient);

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    context: { queryClient },
    scrollRestoration: true,
  });

  router.subscribe("onResolved", ({ toLocation }) => {
    posthog.capture("$pageview", {
      $current_url: toLocation.href,
      path: toLocation.pathname,
    });
  });

  return { router, queryClient, convexClient: convexQueryClient.convexClient };
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>["router"];
  }
}
