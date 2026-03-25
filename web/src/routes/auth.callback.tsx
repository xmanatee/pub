import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isLoading) {
      throw redirect({
        to: context.auth.isAuthenticated ? "/pubs" : "/login",
        replace: true,
      });
    }
  },
  component: () => (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
      <div className="text-muted-foreground text-sm">Completing sign-in…</div>
    </div>
  ),
});
