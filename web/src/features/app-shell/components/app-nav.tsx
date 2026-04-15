import { Link, useMatchRoute } from "@tanstack/react-router";
import { cn } from "~/lib/utils";
import { AgentCountBadge } from "./agent-count-badge";
import { APP_NAV_LINKS, type AppNavLink } from "./app-nav-links";

export function AppNav() {
  const matchRoute = useMatchRoute();
  return (
    <nav aria-label="Main navigation" className="flex items-center gap-0.5 sm:gap-1">
      {APP_NAV_LINKS.map((link) => (
        <HeaderLink key={link.to} link={link} active={!!matchRoute({ to: link.to, fuzzy: true })} />
      ))}
    </nav>
  );
}

function HeaderLink({ link, active }: { link: AppNavLink; active: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      to={link.to}
      className={cn(
        "text-sm transition-colors px-2 py-1 rounded-md pointer-coarse:px-3 pointer-coarse:py-2",
        active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {link.headerCompact ? (
        <>
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{link.label}</span>
        </>
      ) : (
        <>
          {link.label}
          {link.badge === "agentCount" ? <AgentCountBadge className="ml-1.5" /> : null}
        </>
      )}
    </Link>
  );
}
