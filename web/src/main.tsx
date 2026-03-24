import "~/styles/app.css";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { initAuthDebug } from "./lib/auth-debug";
import { initDeveloperMode } from "./lib/developer-mode";
import { initSentry } from "./lib/sentry";
import { getTelegramStartParam, initTelegramSdk, parseStartParam } from "./lib/telegram";
import { getRouter } from "./router";

initDeveloperMode();
initAuthDebug();
initTelegramSdk();

const startParam = getTelegramStartParam();
if (startParam) {
  const parsed = parseStartParam(startParam);
  if (parsed && window.location.pathname !== parsed.path) {
    window.history.replaceState(null, "", parsed.path);
  }
}

const { router, queryClient, convexClient } = getRouter();
initSentry(router);
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

function AuthenticatedRouter() {
  const auth = useConvexAuth();

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-evaluate route guards when auth state transitions
  useEffect(() => {
    router.invalidate();
  }, [auth.isLoading, auth.isAuthenticated]);

  return <RouterProvider router={router} context={{ auth }} />;
}

createRoot(rootElement).render(
  <ConvexAuthProvider client={convexClient} storageNamespace="pub-auth">
    <QueryClientProvider client={queryClient}>
      <AuthenticatedRouter />
    </QueryClientProvider>
  </ConvexAuthProvider>,
);
