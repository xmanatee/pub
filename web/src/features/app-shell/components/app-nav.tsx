import { api } from "@backend/_generated/api";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Settings } from "lucide-react";
import { cn } from "~/lib/utils";

const NAV_LINKS = [
  { to: "/pubs", label: "Pubs" },
  { to: "/agents", label: "Agents" },
  { to: "/explore", label: "Explore" },
] as const;

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "text-sm transition-colors px-2 py-1 rounded-md pointer-coarse:px-3 pointer-coarse:py-2",
        active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function AppNav() {
  const onlineAgentCount = useQuery(api.presence.getOnlineAgentCount);
  const matchRoute = useMatchRoute();

  return (
    <nav aria-label="Main navigation" className="flex items-center gap-0.5 sm:gap-1">
      {NAV_LINKS.map(({ to, label }) => (
        <NavLink key={to} to={to} active={!!matchRoute({ to, fuzzy: true })}>
          {label}
          {label === "Agents" && (
            <span className="ml-1.5 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
              {onlineAgentCount ?? 0}
            </span>
          )}
        </NavLink>
      ))}
      <NavLink to="/settings" active={!!matchRoute({ to: "/settings", fuzzy: true })}>
        <Settings className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Settings</span>
      </NavLink>
    </nav>
  );
}
