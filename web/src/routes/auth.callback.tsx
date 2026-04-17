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
    <div className="auth-panel-min-height flex items-center justify-center px-4">
      <div className="text-muted-foreground text-sm">Completing sign-in…</div>
    </div>
  ),
});
