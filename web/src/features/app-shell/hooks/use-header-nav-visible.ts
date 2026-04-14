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
 * Single source of truth for whether the authenticated top nav (`<AppNav/>`) is
 * currently reachable by the user. Consumed by the root layout (to render the
 * header) and by the live control-bar bridge (to decide whether the status-button
 * menu needs to surface global-nav entries as a fallback).
 *
 * The nav is visible exactly when:
 *   - the user is authenticated, AND
 *   - we are not on a fullscreen-takeover route (pub, app), AND
 *   - either we are not inside Telegram, OR Telegram is in fullscreen mode.
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
