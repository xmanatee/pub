import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import * as React from "react";
import { z } from "zod";

const callbackSearchSchema = z.object({
  code: z.coerce.string().optional(),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: callbackSearchSchema,
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
