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
import { Separator } from "~/components/ui/separator";
import { TooltipProvider } from "~/components/ui/tooltip";
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
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link
              to="/"
              className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity"
            >
              Pub
            </Link>
            <nav className="flex items-center gap-2">
              {isLoading ? null : isAuthenticated ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              )}
            </nav>
          </div>
        </header>
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
        <Separator />
        <footer className="py-6 text-center text-sm text-muted-foreground">
          <div className="max-w-5xl mx-auto px-4">
            Built with TanStack Start, Convex, and Vercel.
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
