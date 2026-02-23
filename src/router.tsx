import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import * as Sentry from "@sentry/react";
import { MutationCache, notifyManager, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import posthog from "posthog-js";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  if (typeof document !== "undefined") {
    notifyManager.setScheduler(window.requestAnimationFrame);
  }

  const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
  if (!CONVEX_URL) {
    console.error("missing envar VITE_CONVEX_URL");
  }
  const convexQueryClient = new ConvexQueryClient(CONVEX_URL);

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
    Wrap: function AuthWrap({ children }) {
      return (
        <ConvexAuthProvider
          client={convexQueryClient.convexClient}
          replaceURL={() => {
            // No-op: the default history.replaceState triggers TanStack
            // Router's history patch, causing a full page reload in SSR
            // mode and aborting the in-flight OAuth code exchange.
          }}
        >
          {children}
        </ConvexAuthProvider>
      );
    },
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  // Track page views on route changes (client-side only)
  if (typeof document !== "undefined") {
    router.subscribe("onResolved", ({ toLocation }) => {
      posthog.capture("$pageview", {
        $current_url: toLocation.href,
        path: toLocation.pathname,
      });
    });
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
