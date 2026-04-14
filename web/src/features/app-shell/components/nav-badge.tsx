import { useOnlineAgentCount } from "~/features/app-shell/hooks/use-online-agent-count";
import { cn } from "~/lib/utils";
import type { AppNavBadge } from "./app-nav-links";

export function NavBadge({ badge, className }: { badge: AppNavBadge; className?: string }) {
  if (badge === "agentCount") return <AgentCountBadge className={className} />;
}

function AgentCountBadge({ className }: { className?: string }) {
  const count = useOnlineAgentCount();
  return (
    <span
      className={cn(
        "inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary",
        className,
      )}
    >
      {count ?? 0}
    </span>
  );
}
