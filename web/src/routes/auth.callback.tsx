import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import * as React from "react";
import { pushAuthDebug } from "~/lib/auth-debug";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    pushAuthDebug("callback_state", { isLoading, isAuthenticated });
    if (isLoading) return;
    const to = isAuthenticated ? "/dashboard" : "/login";
    pushAuthDebug("callback_navigate", { to, isAuthenticated });
    navigate({ to, replace: true });
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
      <div className="text-muted-foreground text-sm">Completing sign-in\u2026</div>
    </div>
  );
}
