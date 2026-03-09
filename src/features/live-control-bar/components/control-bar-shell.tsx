import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { BlobVisual } from "~/features/live/components/visuals/blob-visual";
import { VISUAL_THEME } from "~/features/live/components/visuals/shared";
import type { LiveVisualState } from "~/features/live/types/live-types";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";

interface ControlBarShellProps {
  children: ReactNode;
  collapsed: boolean;
  hasCanvasContent?: boolean;
  onToggleCollapsed: () => void;
  onBackToCanvas: () => void;
  showBackButton: boolean;
  visualState: LiveVisualState;
  leftAction?: ReactNode;
}

export function ControlBarShell({
  children,
  collapsed,
  hasCanvasContent,
  onToggleCollapsed,
  onBackToCanvas,
  showBackButton,
  visualState,
  leftAction,
}: ControlBarShellProps) {
  const showToggle = hasCanvasContent !== false;
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3",
        "transition-transform duration-300",
        collapsed ? "translate-y-full" : null,
      )}
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-4xl">
        {showToggle ? (
          <button
            type="button"
            className="pointer-events-auto absolute -top-12 right-0 size-9 cursor-pointer overflow-hidden rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show control bar" : "Hide control bar"}
          >
            <BlobVisual tone={VISUAL_THEME[visualState]} hasCanvasContent={false} />
          </button>
        ) : null}
        <div className="flex items-end gap-2" {...(collapsed ? { inert: true } : {})}>
          {leftAction}
          <div className="min-w-0 flex-1">{children}</div>
          {showBackButton ? (
            <Button
              type="button"
              variant="secondary"
              size="controlBack"
              className={CB.backButton}
              onClick={onBackToCanvas}
              aria-label="Back to canvas"
            >
              <ArrowLeft />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
