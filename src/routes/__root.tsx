import * as Sentry from "@sentry/react";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import * as React from "react";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";
import { useTelegramBackButton } from "~/hooks/use-telegram-back-button";
import { useTelegramTheme } from "~/hooks/use-telegram-theme";
import { identifyUser, resetIdentity, trackError } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { initPostHog } from "~/lib/posthog";
import { initSentry } from "~/lib/sentry";
import { IN_TELEGRAM } from "~/lib/telegram";
import { api } from "../../convex/_generated/api";

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
    trackError(error);
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

function useIdentifyUser() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");
  const identifiedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (user?._id && identifiedRef.current !== user._id) {
      identifiedRef.current = user._id;
      identifyUser(user._id);
    }
    if (!isAuthenticated && identifiedRef.current) {
      identifiedRef.current = null;
      resetIdentity();
    }
  }, [user, isAuthenticated]);
}

function RootComponent() {
  useIdentifyUser();
  useTelegramBackButton();
  useTelegramTheme();

  return (
    <PostHogProvider client={posthog}>
      <Sentry.ErrorBoundary
        fallback={({ error }) => (
          <SentryErrorComponent error={error instanceof Error ? error : new Error(String(error))} />
        )}
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

  React.useEffect(() => {
    pushAuthDebug("root_auth_state", { isLoading, isAuthenticated });
  }, [isLoading, isAuthenticated]);

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingTop: "var(--safe-top)" }}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <header
        style={{ top: "var(--safe-top)" }}
        className="sticky z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl"
      >
        <div
          className={`max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center ${IN_TELEGRAM ? "justify-center" : "justify-between"}`}
        >
          <Link
            to={isAuthenticated ? "/dashboard" : "/"}
            aria-label="Pub home"
            className="hover:opacity-80 transition-opacity"
          >
            <PubWordmark iconSize={22} className="text-foreground" />
          </Link>
          {!IN_TELEGRAM && !isLoading && !isAuthenticated && (
            <nav aria-label="Main navigation" className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="pointer-coarse:h-11" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button size="sm" className="pointer-coarse:h-11" asChild>
                <Link to="/login">Get started</Link>
              </Button>
            </nav>
          )}
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer style={{ paddingBottom: "var(--safe-bottom)" }} className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <PubWordmark
                iconSize={18}
                className="text-muted-foreground text-sm"
                aria-hidden="true"
              />
              <Link
                to="/explore"
                className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
              >
                Explore
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              by{" "}
              <a
                href="https://nemi.love"
                className="underline hover:text-foreground transition-colors"
              >
                nemi.love
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
