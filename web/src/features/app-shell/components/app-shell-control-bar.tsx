import { api } from "@backend/_generated/api";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Menu, Play, Plus, X } from "lucide-react";
import * as React from "react";
import { useControlBarLayer } from "~/components/control-bar/control-bar-controller";
import { ControlBarPanel } from "~/components/control-bar/control-bar-parts";
import {
  CONTROL_BAR_PRIORITY,
  type ControlBarAddon,
} from "~/components/control-bar/control-bar-types";
import { Button } from "~/components/ui/button";
import { useIsFullscreenRoute } from "~/features/app-shell/hooks/use-header-nav-visible";
import { useStartLive } from "~/features/pubs/hooks/use-start-live";
import { AppNavMenu } from "./app-nav-menu";

const NO_ADDONS: ControlBarAddon[] = [];

type NewState =
  | { kind: "ready"; label: "Create a new pub" }
  | { kind: "starting"; label: "Starting new pub…" }
  | { kind: "checking"; label: "Checking agent availability" }
  | { kind: "offline"; label: "Agent offline" };

function resolveNewState(agentOnline: boolean | undefined, pending: boolean): NewState {
  if (pending) return { kind: "starting", label: "Starting new pub…" };
  if (agentOnline === undefined) return { kind: "checking", label: "Checking agent availability" };
  if (!agentOnline) return { kind: "offline", label: "Agent offline" };
  return { kind: "ready", label: "Create a new pub" };
}

/**
 * Always-on shell layer for authenticated users. The live bar pushes a
 * higher-priority layer on top, so on `/p/$slug` and `/app` this stays mounted
 * but is not rendered.
 */
export function AppShellControlBar() {
  const matchRoute = useMatchRoute();
  const fullscreenRoute = useIsFullscreenRoute();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { startLive, pending, agentOnline } = useStartLive();

  // Skip the live subscription on routes where this layer is hidden anyway.
  const lastPub = useQuery(api.pubs.getLastViewedByUser, fullscreenRoute ? "skip" : {}) ?? null;
  const showResume =
    lastPub &&
    !matchRoute({ to: "/pubs" }) &&
    !matchRoute({ to: "/p/$slug", params: { slug: lastPub.slug } });

  const closeMenu = React.useCallback(() => setMenuOpen(false), []);
  const toggleMenu = React.useCallback(() => setMenuOpen((v) => !v), []);

  const handleNew = React.useCallback(async () => {
    setMenuOpen(false);
    await startLive();
  }, [startLive]);

  const newState = resolveNewState(agentOnline, pending);

  useControlBarLayer({
    priority: CONTROL_BAR_PRIORITY.shell,
    expanded: true,
    addons: menuOpen
      ? [
          {
            key: "app-nav",
            content: (
              <div role="menu" aria-label="Main navigation" className="px-2 pt-3 pb-1">
                <AppNavMenu onNavigate={closeMenu} />
              </div>
            ),
          },
        ]
      : NO_ADDONS,
    backdropVisible: menuOpen,
    backdropOnClick: menuOpen ? closeMenu : undefined,
    statusButton: {
      ariaLabel: menuOpen ? "Close menu" : "Open menu",
      content: menuOpen ? (
        <X className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Menu className="h-4 w-4" aria-hidden="true" />
      ),
      onClick: toggleMenu,
    },
    mainContent: (
      <ControlBarPanel>
        <Button
          variant="ghost"
          type="button"
          className="h-10 shrink-0 gap-2 rounded-full px-4 text-sm font-medium"
          onClick={handleNew}
          disabled={newState.kind !== "ready"}
          aria-label={newState.label}
        >
          <Plus className="size-4" aria-hidden="true" />
          New
        </Button>
        {showResume ? (
          <Button
            asChild
            variant="ghost"
            className="h-10 min-w-0 flex-1 justify-start gap-2 rounded-full px-3 text-sm"
          >
            <Link to="/p/$slug" params={{ slug: lastPub.slug }}>
              <Play className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-muted-foreground">Resume</span>
              <span className="truncate font-medium text-foreground">
                {lastPub.title ?? lastPub.slug}
              </span>
            </Link>
          </Button>
        ) : null}
      </ControlBarPanel>
    ),
  });

  return null;
}
