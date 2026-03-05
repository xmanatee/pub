import { redirect } from "@tanstack/react-router";

export function requireDevRoute() {
  if (!import.meta.env.DEV) {
    throw redirect({ to: "/" });
  }
}
