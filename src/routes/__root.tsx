/// <reference types="vite/client" />

import * as Sentry from "@sentry/react";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import * as React from "react";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";
import { initPostHog } from "~/lib/posthog";
import { initSentry } from "~/lib/sentry";
import appCss from "~/styles/app.css?url";

// Initialize Sentry and PostHog as early as possible (client-side only)
if (typeof window !== "undefined") {
  initSentry();
  initPostHog();
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pub — Instant content publishing" },
      {
        name: "description",
        content:
          "Publish HTML, CSS, JS, and Markdown files instantly. Get a shareable URL in seconds.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootComponent,
  errorComponent: SentryErrorComponent,
});

function SentryErrorComponent({ error }: { error: Error }) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 px-4">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground text-center max-w-md">
        An unexpected error occurred. The issue has been reported and we're looking into it.
      </p>
      <Button onClick={() => window.location.reload()}>Reload page</Button>
    </div>
  );
}

function RootComponent() {
  return (
    <PostHogProvider client={posthog}>
      <Sentry.ErrorBoundary
        fallback={({ error }) => <SentryErrorComponent error={error as Error} />}
      >
        <TooltipProvider>
          <RootDocument>
            <Outlet />
          </RootDocument>
        </TooltipProvider>
      </Sentry.ErrorBoundary>
    </PostHogProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <PubWordmark iconSize={22} className="text-foreground" />
            </Link>
            <nav className="flex items-center gap-3">
              {isLoading ? null : isAuthenticated ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/login">Sign in</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/login">Get started</Link>
                  </Button>
                </>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-border/50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <PubWordmark iconSize={18} className="text-muted-foreground text-sm" />
              <p className="text-sm text-muted-foreground">
                Built with Convex, TanStack Start, and Tailwind CSS.
              </p>
            </div>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
