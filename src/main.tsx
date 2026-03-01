import "~/styles/app.css";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { initAuthDebug } from "./lib/auth-debug";
import { initDeveloperMode } from "./lib/developer-mode";
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
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
  <ConvexAuthProvider client={convexClient} storageNamespace="pub-auth">
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </ConvexAuthProvider>,
);
