import { Link, useRouterState } from "@tanstack/react-router";
import { Circle, Moon, Search, Sun } from "lucide-react";
import { cn } from "~/core/cn";
import { MOD_KEY_LABEL } from "~/core/hooks/use-keyboard-shortcuts";
import { SERVICES } from "~/core/navigation/registry";
import { Button } from "~/core/ui/button";
import { useCommandPalette } from "./command-palette";
import { useTheme } from "./theme";

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { open } = useCommandPalette();
  const { theme, toggle } = useTheme();
  const primary = SERVICES.filter((item) =>
    ["briefing", "inbox", "mail", "contacts", "calendar", "telegram", "tasks"].includes(item.id),
  );
  const library = SERVICES.filter((item) =>
    ["notes", "reader", "files", "tracker", "settings"].includes(item.id),
  );
  const mobileItems = [...primary, ...library];
  return (
    <>
      <nav className="hidden h-full w-60 shrink-0 flex-col gap-3 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground md:flex">
        <BrandBlock />
        <SearchButton onClick={open} />
        <div className="flex-1 space-y-4 overflow-y-auto">
          <ServiceGroup title="Operate" items={primary} pathname={pathname} />
          <ServiceGroup title="Library" items={library} pathname={pathname} />
        </div>
        <div className="border-t border-sidebar-border pt-2">
          <ThemeButton theme={theme} onClick={toggle} />
        </div>
      </nav>

      <header className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <BrandBlock compact />
          <button
            type="button"
            onClick={open}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-background/55 text-muted-foreground transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Search"
          >
            <Search className="size-4" />
          </button>
          <ThemeButton theme={theme} onClick={toggle} compact />
        </div>
        <nav aria-label="Primary" className="overflow-x-auto px-3 pb-2">
          <div className="flex gap-1.5">
            {mobileItems.map((item) => (
              <ServiceLink key={item.id} item={item} pathname={pathname} compact />
            ))}
          </div>
        </nav>
      </header>
    </>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-sidebar-border bg-background/55",
        compact ? "min-w-0 flex-1 p-2" : "p-3",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          S
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Super-App</div>
          <div className="flex items-center gap-1.5 text-tiny text-muted-foreground">
            <Circle className="size-2 shrink-0 fill-primary text-primary" />
            <span className="truncate">Local command center</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-background/55 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Search</span>
      <span className="rounded border border-border bg-muted px-1 font-mono text-tiny">
        {MOD_KEY_LABEL}K
      </span>
    </button>
  );
}

function ThemeButton({
  theme,
  onClick,
  compact = false,
}: {
  theme: "dark" | "light";
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(compact ? "size-9 shrink-0 p-0" : "w-full justify-start")}
      onClick={onClick}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {!compact ? (
        <span className="ml-1 text-xs">{theme === "dark" ? "Light" : "Dark"} mode</span>
      ) : null}
    </Button>
  );
}

function ServiceLink({
  item,
  pathname,
  compact = false,
}: {
  item: (typeof SERVICES)[number];
  pathname: string;
  compact?: boolean;
}) {
  const active = item.route === "/" ? pathname === "/" : pathname.startsWith(item.route);
  const Icon = item.icon;
  return (
    <Link
      to={item.route}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors",
        compact ? "shrink-0 border border-sidebar-border px-3 py-2" : "px-3 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function ServiceGroup({
  title,
  items,
  pathname,
}: {
  title: string;
  items: typeof SERVICES;
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-2 text-tiny font-semibold uppercase text-muted-foreground">{title}</div>
      {items.map((item) => (
        <ServiceLink key={item.id} item={item} pathname={pathname} />
      ))}
    </div>
  );
}
