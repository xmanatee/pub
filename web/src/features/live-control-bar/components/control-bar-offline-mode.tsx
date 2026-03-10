import { LayoutDashboard } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";

interface ControlBarOfflineModeProps {
  onExit: () => void;
}

export function ControlBarOfflineMode({ onExit }: ControlBarOfflineModeProps) {
  return (
    <div className={cn(CB.controlBar, CB.controlHeight)}>
      <span className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">
        Agent offline
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="control"
            className={CB.actionButton}
            onClick={onExit}
            aria-label="Dashboard"
          >
            <LayoutDashboard />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Dashboard</TooltipContent>
      </Tooltip>
    </div>
  );
}
