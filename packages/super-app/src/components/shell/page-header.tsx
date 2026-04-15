import { RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  onRefresh,
  refreshing,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b bg-background/80 px-6 py-4 backdrop-blur",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            aria-label="Refresh"
            disabled={refreshing}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
