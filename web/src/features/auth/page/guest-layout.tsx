import { Outlet } from "@tanstack/react-router";

export function GuestLayout() {
  // Guest routes must render immediately. Route guards already redirect once auth
  // resolves, and blocking here can stall the landing/login pages on slow auth init.
  return <Outlet />;
}
