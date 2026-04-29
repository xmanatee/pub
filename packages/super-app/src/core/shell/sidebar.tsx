import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Search, Sun } from "lucide-react";
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
  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
      <button
        type="button"
        onClick={open}
        className="mb-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/60"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search</span>
        <span className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
          {MOD_KEY_LABEL}K
        </span>
      </button>
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Workspace
        </div>
        {SERVICES.map((item) => {
          const active = item.route === "/" ? pathname === "/" : pathname.startsWith(item.route);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={item.route}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="border-t border-sidebar-border pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={toggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          <span className="ml-1 text-xs">{theme === "dark" ? "Light" : "Dark"} mode</span>
        </Button>
      </div>
    </nav>
  );
}
