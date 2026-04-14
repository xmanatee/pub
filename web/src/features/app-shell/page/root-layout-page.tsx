import { api } from "@backend/_generated/api";
import * as Sentry from "@sentry/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import * as React from "react";
import { ControlBarProvider } from "~/components/control-bar/control-bar-controller";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";
import { AppNav } from "~/features/app-shell/components/app-nav";
import { AppShellControlBar } from "~/features/app-shell/components/app-shell-control-bar";
import {
  useHeaderNavVisible,
  useIsFullscreenRoute,
} from "~/features/app-shell/hooks/use-header-nav-visible";
import { TelegramNotLinkedPage } from "~/features/auth/page/telegram-not-linked-page";
import { useTelegramAuth } from "~/hooks/use-telegram-auth";
import { useTelegramBackButton } from "~/hooks/use-telegram-back-button";
import { identifyUser, resetIdentity, trackError } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { initPostHog } from "~/lib/posthog";
import { IN_TELEGRAM } from "~/lib/telegram";
import { useThemeSync } from "~/lib/theme";

initPostHog();

const SentryErrorBoundary = Sentry.ErrorBoundary as unknown as React.ComponentType<
  React.PropsWithChildren<Sentry.ErrorBoundaryProps>
>;

export function RootRouteErrorPage({ error }: { error: Error }) {
  React.useEffect(() => {
    trackError(error);
  }, [error]);

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4"
      style={{ minHeight: "50vh" }}
    >
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
  useThemeSync();
  const { telegramPending, telegramNotLinked, createTelegramAccount } = useTelegramAuth();
  const [showNotLinked, setShowNotLinked] = React.useState(false);

  React.useEffect(() => {
    if (telegramNotLinked) setShowNotLinked(true);
  }, [telegramNotLinked]);

  if (telegramPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground text-sm">Signing in via Telegram…</div>
      </div>
    );
  }

  if (showNotLinked) {
    return (
      <TelegramNotLinkedPage
        createAccount={createTelegramAccount}
        onDone={() => setShowNotLinked(false)}
      />
    );
  }

  return (
    <PostHogProvider client={posthog}>
      <SentryErrorBoundary
        fallback={({ error }: { error: unknown }) => (
          <RootRouteErrorPage error={error instanceof Error ? error : new Error(String(error))} />
        )}
      >
        <TooltipProvider>
          <ControlBarProvider>
            <AppLayout>
              <Outlet />
            </AppLayout>
          </ControlBarProvider>
        </TooltipProvider>
      </SentryErrorBoundary>
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

type HeaderKind = "authenticated" | "guest" | "none";

function resolveHeaderKind({
  headerNavVisible,
  isAuthenticated,
  isLoading,
}: {
  headerNavVisible: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
}): HeaderKind {
  if (headerNavVisible) return "authenticated";
  if (!isLoading && !isAuthenticated) return "guest";
  return "none";
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const headerNavVisible = useHeaderNavVisible();
  const isFullscreenRoute = useIsFullscreenRoute();

  React.useEffect(() => {
    pushAuthDebug("root_auth_state", { isLoading, isAuthenticated });
  }, [isLoading, isAuthenticated]);

  return (
    <>
      {isAuthenticated ? <AppShellControlBar /> : null}
      {isFullscreenRoute ? (
        <div className="pub-overlay flex flex-col h-screen w-full overflow-hidden bg-background">
          {children}
        </div>
      ) : (
        <FramedLayout
          headerKind={resolveHeaderKind({ headerNavVisible, isAuthenticated, isLoading })}
        >
          {children}
        </FramedLayout>
      )}
    </>
  );
}

function FramedLayout({
  children,
  headerKind,
}: {
  children: React.ReactNode;
  headerKind: HeaderKind;
}) {
  return (
    <div
      className="flex flex-col min-h-screen w-full"
      style={{ paddingTop: IN_TELEGRAM ? "var(--safe-top)" : undefined }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {headerKind === "none" ? null : (
        <ShellHeader home={headerKind === "authenticated" ? "/pubs" : "/"}>
          {headerKind === "authenticated" ? <AppNav /> : <GuestNav />}
        </ShellHeader>
      )}
      <main id="main" className="flex-1 max-w-4xl mx-auto w-full">
        {children}
      </main>
      {!IN_TELEGRAM ? <ShellFooter /> : null}
    </div>
  );
}

function ShellHeader({ home, children }: { home: "/" | "/pubs"; children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to={home} aria-label="Pub home" className="hover:opacity-80 transition-opacity">
          <PubWordmark iconSize={22} className="text-foreground" />
        </Link>
        {children}
      </div>
    </header>
  );
}

function GuestNav() {
  return (
    <nav aria-label="Main navigation" className="flex items-center gap-3">
      <a
        href="https://github.com/xmanatee/pub"
        target="_blank"
        rel="noreferrer"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        GitHub
      </a>
      <Button size="sm" className="pointer-coarse:h-11" asChild>
        <Link to="/login">Sign in</Link>
      </Button>
    </nav>
  );
}

function ShellFooter() {
  return (
    <footer className="relative z-0 border-t border-border/50 bg-background">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <PubWordmark iconSize={18} className="text-muted-foreground text-sm" aria-hidden="true" />
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
  );
}
