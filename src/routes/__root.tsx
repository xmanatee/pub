/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";
import { PubWordmark } from "~/components/pub-logo";
import appCss from "~/styles/app.css?url";

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
});

function RootComponent() {
  return (
    <TooltipProvider>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </TooltipProvider>
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
            <Link
              to="/"
              className="hover:opacity-80 transition-opacity"
            >
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
