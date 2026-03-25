import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireGuest } from "~/lib/route-guards";

export const Route = createFileRoute("/_guest")({
  beforeLoad: ({ context }) => requireGuest(context.auth),
  component: GuestLayout,
});

export function GuestLayout() {
  // Guest routes must render immediately. Route guards already redirect once auth
  // resolves, and blocking here can stall the landing/login pages on slow auth init.
  return <Outlet />;
}
