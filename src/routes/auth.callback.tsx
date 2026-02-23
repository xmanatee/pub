import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import * as React from "react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isLoading) return;
    navigate({ to: isAuthenticated ? "/dashboard" : "/login", replace: true });
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
      <div className="text-muted-foreground text-sm">Completing sign-in...</div>
    </div>
  );
}
