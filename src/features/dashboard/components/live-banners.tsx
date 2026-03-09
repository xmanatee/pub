import { Link } from "@tanstack/react-router";
import { ExternalLink, Radio } from "lucide-react";
import { Badge } from "~/components/ui/badge";

export interface LiveSession {
  slug: string;
  hasConnection: boolean;
}

export function LiveBanners({ lives }: { lives: LiveSession[] }) {
  if (lives.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      <h3 className="text-sm font-medium text-muted-foreground">Live Now</h3>
      {lives.map((s) => (
        <Link
          key={s.slug}
          to="/p/$slug"
          params={{ slug: s.slug }}
          className="group flex items-center justify-between rounded-lg border border-emerald-600/20 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 transition-colors hover:border-emerald-600/40"
        >
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600 animate-pulse" aria-hidden="true" />
            <span className="font-medium text-sm">{s.slug}</span>
            <Badge
              variant="outline"
              className="gap-1 text-emerald-600 border-emerald-600/20 text-xs"
            >
              {s.hasConnection ? "Connected" : "Waiting"}
            </Badge>
          </div>
          <ExternalLink
            className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          />
        </Link>
      ))}
    </div>
  );
}
