import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import type { TunnelViewMode } from "./types";

const VIEW_OPTIONS: { label: string; mode: TunnelViewMode }[] = [
  { label: "Canvas view", mode: "canvas" },
  { label: "Chat view", mode: "chat" },
  { label: "Settings", mode: "settings" },
];

interface ExtendedOptionsProps {
  viewMode: TunnelViewMode;
  onClose?: () => void;
  onSelect: (mode: TunnelViewMode) => void;
}

export function ExtendedOptions({ viewMode, onClose, onSelect }: ExtendedOptionsProps) {
  const available = VIEW_OPTIONS.filter((o) => o.mode !== viewMode);

  return (
    <div className="flex flex-col gap-0.5 px-2 pt-3 pb-1" role="menu">
      {available.map((opt) => (
        <Button
          key={opt.mode}
          variant="ghost"
          className="h-10 w-full justify-start rounded-xl px-3 text-sm font-medium"
          role="menuitem"
          onClick={() => onSelect(opt.mode)}
        >
          {opt.label}
        </Button>
      ))}
      {onClose ? (
        <>
          <Separator className="my-0.5" />
          <Button
            variant="ghost"
            className="h-10 w-full justify-start rounded-xl px-3 text-sm font-medium text-destructive"
            role="menuitem"
            onClick={onClose}
          >
            Close
          </Button>
        </>
      ) : null}
    </div>
  );
}
