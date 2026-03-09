import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";

interface ControlBarDisconnectedModeProps {
  onExit: () => void;
  onReconnect: () => void;
}

export function ControlBarDisconnectedMode({
  onExit,
  onReconnect,
}: ControlBarDisconnectedModeProps) {
  return (
    <div className={cn(CB.controlBar, CB.controlHeight)}>
      <span className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">
        Connection lost
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="control"
            className={CB.actionButton}
            onClick={onReconnect}
            aria-label="Reconnect"
          >
            <RefreshCw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reconnect</TooltipContent>
      </Tooltip>
    </div>
  );
}
