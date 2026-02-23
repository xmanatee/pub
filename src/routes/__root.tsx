import * as Sentry from "@sentry/react";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import * as React from "react";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";
import { initPostHog } from "~/lib/posthog";
import { initSentry } from "~/lib/sentry";

initSentry();
initPostHog();

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
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
          <AppLayout>
            <Outlet />
          </AppLayout>
        </TooltipProvider>
      </Sentry.ErrorBoundary>
    </PostHogProvider>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <>
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
              Built with Convex, TanStack Router, and Tailwind CSS.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
