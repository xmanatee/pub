import { api } from "@backend/_generated/api";
import { useQuery } from "convex/react";
import { cn } from "~/lib/utils";

export function AgentCountBadge({ className }: { className?: string }) {
  const count = useQuery(api.presence.getOnlineAgentCount);
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
