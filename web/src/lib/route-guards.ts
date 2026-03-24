import { redirect } from "@tanstack/react-router";

export type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
};

export function requireAuth(auth: AuthState): void {
  if (!auth.isLoading && !auth.isAuthenticated) {
    throw redirect({ to: "/login" });
  }
}

export function requireGuest(auth: AuthState): void {
  if (!auth.isLoading && auth.isAuthenticated) {
    throw redirect({ to: "/dashboard" });
  }
}
