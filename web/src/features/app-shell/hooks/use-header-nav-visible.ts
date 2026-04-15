import { useMatches } from "@tanstack/react-router";
import { useSignal } from "@telegram-apps/sdk-react";
import { useConvexAuth } from "convex/react";
import { IN_TELEGRAM, isFullscreen } from "~/lib/telegram";

/** Routes that take over the full viewport — no header, footer, or main wrapper. */
const FULLSCREEN_ROUTE_IDS: ReadonlySet<string> = new Set(["/_authenticated/app", "/p/$slug"]);

export function useIsFullscreenRoute(): boolean {
  const matches = useMatches();
  return matches.some((m) => FULLSCREEN_ROUTE_IDS.has(m.routeId));
}

/**
 * Single source of truth for whether the authenticated top nav is reachable.
 * The live control-bar bridge mirrors a fallback global-nav menu when this is false.
 */
export function useHeaderNavVisible(): boolean {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const telegramFullscreen = useSignal(isFullscreen);
  const fullscreenRoute = useIsFullscreenRoute();

  if (isLoading || !isAuthenticated) return false;
  if (fullscreenRoute) return false;
  if (IN_TELEGRAM && !telegramFullscreen) return false;
  return true;
}
