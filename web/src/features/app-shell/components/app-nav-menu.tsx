import { Link, useMatchRoute } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { AgentCountBadge } from "./agent-count-badge";
import { APP_NAV_LINKS } from "./app-nav-links";

/**
 * Menu items for the global app navigation. The caller owns the wrapping
 * `role="menu"` (and `aria-label`) so this can be either the entire menu
 * (shell bar) or a sub-section of a larger menu (live extended options).
 */
export function AppNavMenu({ onNavigate }: { onNavigate?: () => void }) {
  const matchRoute = useMatchRoute();
  return (
    <div className="flex flex-col gap-0.5">
      {APP_NAV_LINKS.map((link) => {
        const Icon = link.icon;
        const active = !!matchRoute({ to: link.to, fuzzy: true });
        return (
          <Button
            key={link.to}
            asChild
            variant="ghost"
            role="menuitem"
            className="h-10 w-full justify-start gap-2 rounded-xl px-3 text-sm font-medium"
          >
            <Link to={link.to} aria-current={active ? "page" : undefined} onClick={onNavigate}>
              <Icon className="size-4" aria-hidden="true" />
              <span className="flex-1 text-left">{link.label}</span>
              {link.badge === "agentCount" ? <AgentCountBadge /> : null}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
