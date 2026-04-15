import {
  AppWindow,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Terminal,
  Users,
} from "lucide-react";

export interface AppNavLink {
  to: "/pubs" | "/app" | "/agents" | "/explore" | "/settings";
  label: string;
  icon: LucideIcon;
  /** When true the header shows icon-only (label still announced via `sr-only`). */
  headerCompact?: boolean;
  /** Trailing badge type. Today only "agentCount"; widen the union when more arrive. */
  badge?: "agentCount";
}

/**
 * Single source of truth for authenticated app-level navigation. Consumed by both
 * the header `AppNav` and the status-button `AppNavMenu`; per-link presentation
 * (compact in header, badge content) is data, not branched in the renderers.
 */
export const APP_NAV_LINKS: readonly AppNavLink[] = [
  { to: "/pubs", label: "Pubs", icon: LayoutDashboard },
  { to: "/app", label: "App", icon: AppWindow },
  { to: "/agents", label: "Agents", icon: Terminal, badge: "agentCount" },
  { to: "/explore", label: "Explore", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings, headerCompact: true },
] as const;
