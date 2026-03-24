import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { requireGuest } from "~/lib/route-guards";

export const Route = createFileRoute("/_guest")({
  beforeLoad: ({ context }) => requireGuest(context.auth),
  component: GuestLayout,
});

function GuestLayout() {
  const { isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return <Outlet />;
}
