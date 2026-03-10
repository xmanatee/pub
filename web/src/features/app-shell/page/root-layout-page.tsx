import { api } from "@backend/_generated/api";
import * as Sentry from "@sentry/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useSignal } from "@telegram-apps/sdk-react";
import { useConvexAuth, useQuery } from "convex/react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import * as React from "react";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";
import { useTelegramAuth } from "~/hooks/use-telegram-auth";
import { useTelegramBackButton } from "~/hooks/use-telegram-back-button";
import { useTelegramTheme } from "~/hooks/use-telegram-theme";
import { identifyUser, resetIdentity, trackError } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { initPostHog } from "~/lib/posthog";
import { initSentry } from "~/lib/sentry";
import { IN_TELEGRAM, isFullscreen } from "~/lib/telegram";

initSentry();
initPostHog();

export function RootRouteErrorPage({ error }: { error: Error }) {
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

export function RootLayoutPage() {
  useIdentifyUser();
  useTelegramBackButton();
  useTelegramTheme();
  const { telegramPending } = useTelegramAuth();

  if (telegramPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground text-sm">Signing in via Telegram…</div>
      </div>
    );
  }

  return (
    <PostHogProvider client={posthog}>
      <Sentry.ErrorBoundary
        fallback={({ error }) => (
          <RootRouteErrorPage error={error instanceof Error ? error : new Error(String(error))} />
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

function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const fullscreen = useSignal(isFullscreen);
  const showHeader = !IN_TELEGRAM || fullscreen;

  React.useEffect(() => {
    pushAuthDebug("root_auth_state", { isLoading, isAuthenticated });
  }, [isLoading, isAuthenticated]);

  return (
    <div
      className="flex flex-col min-h-screen max-w-4xl mx-auto w-full"
      style={{ paddingTop: IN_TELEGRAM ? "var(--safe-top)" : undefined }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      {showHeader ? (
        <header
          className={
            fullscreen
              ? "fixed inset-x-0 top-0 z-50"
              : "sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl"
          }
          style={fullscreen ? { paddingTop: "var(--device-safe-top)" } : undefined}
        >
          <div
            className={
              fullscreen
                ? "flex items-center justify-center px-16"
                : `px-4 sm:px-6 h-14 flex items-center justify-between`
            }
            style={fullscreen ? { height: "var(--content-safe-top)" } : undefined}
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
      ) : null}
      <main id="main" className="flex-1">
        {children}
      </main>
      {!IN_TELEGRAM ? (
        <footer className="border-t border-border/50">
          <div className="px-4 sm:px-6 py-8">
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
      ) : null}
    </div>
  );
}
