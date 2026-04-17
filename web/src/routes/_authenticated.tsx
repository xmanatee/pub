import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { requireAuth } from "~/lib/route-guards";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => requireAuth(context.auth),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="auth-loading-panel flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return <Outlet />;
}
