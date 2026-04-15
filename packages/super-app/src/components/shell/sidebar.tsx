import { FileText, FolderTree, MessageCircle, Newspaper, Sunrise } from "lucide-react";
import { cn } from "~/lib/cn";
import { type RouteId, useRouter } from "~/lib/router";

interface NavItem {
  id: RouteId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { id: "briefing", label: "Briefing", icon: Sunrise },
  { id: "telegram", label: "Messages", icon: MessageCircle },
  { id: "reader", label: "Reader", icon: Newspaper },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "tracker", label: "Tracker", icon: FileText },
];

export function Sidebar() {
  const { route, navigate } = useRouter();
  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
      <div className="px-2 pb-3 pt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Workspace
      </div>
      {NAV.map((item) => {
        const active = route === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
