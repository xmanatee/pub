import { AppWindow, type LucideIcon, MessageCircle, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import type { LiveViewMode } from "~/features/live/types/live-types";

const VIEW_OPTIONS: { label: string; mode: LiveViewMode; icon: LucideIcon }[] = [
  { label: "Canvas view", mode: "canvas", icon: AppWindow },
  { label: "Chat view", mode: "chat", icon: MessageCircle },
  { label: "Settings", mode: "settings", icon: Settings },
];

interface LiveViewOptionsProps {
  viewMode: LiveViewMode;
  onSelect: (mode: LiveViewMode) => void;
  /** Appended beneath a separator. Used by the live bridge to surface app-nav when the top header is hidden. */
  footer?: ReactNode;
}

export function LiveViewOptions({ viewMode, onSelect, footer }: LiveViewOptionsProps) {
  const available = VIEW_OPTIONS.filter((o) => o.mode !== viewMode);

  return (
    <div className="flex flex-col gap-0.5 px-2 pt-3 pb-1" role="menu">
      {available.map((opt) => (
        <Button
          key={opt.mode}
          variant="ghost"
          className="h-10 w-full justify-start gap-2 rounded-xl px-3 text-sm font-medium"
          role="menuitem"
          onClick={() => onSelect(opt.mode)}
        >
          <opt.icon className="size-4" />
          {opt.label}
        </Button>
      ))}
      {footer ? (
        <>
          <Separator className="my-0.5" />
          {footer}
        </>
      ) : null}
    </div>
  );
}
