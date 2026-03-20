import { LoaderCircle } from "lucide-react";
import { ControlBarPanel } from "~/components/control-bar/control-bar-parts";

interface ControlBarBusyModeProps {
  label: string;
}

export function ControlBarBusyMode({ label }: ControlBarBusyModeProps) {
  return (
    <ControlBarPanel>
      <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground">{label}</span>
    </ControlBarPanel>
  );
}
