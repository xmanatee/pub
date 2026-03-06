import { useConvexAuth } from "convex/react";

export function useEffectiveAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const hasConfiguredConvex = Boolean(import.meta.env.VITE_CONVEX_URL);
  return {
    isLoading: hasConfiguredConvex ? isLoading : false,
    isAuthenticated: hasConfiguredConvex ? isAuthenticated : false,
    hasConfiguredConvex,
    hasE2EFallback: Boolean(import.meta.env.VITE_E2E_AUTH_BASE_URL),
  };
}
