import { LoaderCircle } from "lucide-react";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";

interface ControlBarBusyModeProps {
  label: string;
}

export function ControlBarBusyMode({ label }: ControlBarBusyModeProps) {
  return (
    <div className={cn(CB.controlBar, CB.controlHeight)}>
      <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
