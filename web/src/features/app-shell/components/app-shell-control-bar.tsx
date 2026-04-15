import { api } from "@backend/_generated/api";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Play, Plus } from "lucide-react";
import * as React from "react";
import { Blob } from "~/components/blob/blob";
import { useControlBarLayer } from "~/components/control-bar/control-bar-controller";
import { ControlBarPanel } from "~/components/control-bar/control-bar-parts";
import { CONTROL_BAR_PRIORITY } from "~/components/control-bar/control-bar-types";
import { Button } from "~/components/ui/button";
import { useIsFullscreenRoute } from "~/features/app-shell/hooks/use-header-nav-visible";
import { LIVE_BLOB_TONES } from "~/features/live/blob/live-blob-tones";
import { useStartLive } from "~/features/pubs/hooks/use-start-live";
import { AppNavMenu } from "./app-nav-menu";

/** The shell has no live session, so the blob renders in its neutral idle tone. */
const SHELL_BLOB_CONTENT = <Blob tone={LIVE_BLOB_TONES.idle} />;

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

/** The live bar pushes a higher-priority layer on `/p/$slug` and `/app`, hiding this one. */
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
      : undefined,
    backdropVisible: menuOpen,
    backdropOnClick: menuOpen ? closeMenu : undefined,
    statusButton: {
      ariaLabel: menuOpen ? "Close menu" : "Open menu",
      content: SHELL_BLOB_CONTENT,
      onClick: toggleMenu,
    },
    mainContent: (
      <ControlBarPanel>
        <Button
          variant="ghost"
          type="button"
          className="h-10 min-w-0 flex-1 justify-start gap-2 rounded-full px-4 text-sm font-medium"
          onClick={handleNew}
          disabled={newState.kind !== "ready"}
          aria-label={newState.label}
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">New</span>
        </Button>
        {showResume ? (
          <Button
            asChild
            variant="ghost"
            className="h-10 max-w-[60%] shrink-0 gap-2 rounded-full px-3 text-sm"
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
