import "~/styles/app.css";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { getRouter } from "./router";

const { router, queryClient, convexClient } = getRouter();

// biome-ignore lint/style/noNonNullAssertion: root element always exists in index.html
createRoot(document.getElementById("root")!).render(
  <ConvexAuthProvider client={convexClient}>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </ConvexAuthProvider>,
);
