import { cn } from "~/lib/utils";
import type { ControlBarFullConfig } from "./control-bar-types";

export function ControlBarPrimitive({
  leftAction,
  centerContent,
  rightAction,
  topAddon,
  statusAction,
  isExpanded,
  onStatusClick,
  className,
  isInteracting = false,
}: ControlBarFullConfig) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3",
        "transition-all duration-500 ease-in-out",
        isExpanded ? "translate-y-0 opacity-100 scale-100" : "translate-y-full opacity-0 scale-95",
      )}
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-4xl">
        {statusAction && (
          <button
            type="button"
            className={cn(
              "pointer-events-auto absolute -top-12 right-0 size-9 cursor-pointer overflow-hidden rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl",
              "transition-all duration-500 ease-in-out",
              isInteracting
                ? "opacity-0 scale-50 translate-y-4 pointer-events-none"
                : "opacity-100 scale-100 translate-y-0",
            )}
            onClick={onStatusClick}
            aria-label="Toggle control bar"
          >
            {statusAction}
          </button>
        )}

        <div
          className={cn(
            "flex items-end gap-2 transition-all duration-500 ease-in-out",
            rightAction && !leftAction
              ? "translate-x-8"
              : leftAction && !rightAction
                ? "-translate-x-8"
                : "translate-x-0",
          )}
          {...(!isExpanded ? { inert: true } : {})}
        >
          <div
            className={cn(
              "transition-all duration-500 ease-in-out shrink-0",
              leftAction && !isInteracting
                ? "opacity-100 scale-100 w-auto translate-x-0"
                : "opacity-0 scale-75 pointer-events-none w-0 -ml-2 -translate-x-4",
            )}
          >
            {leftAction}
          </div>

          <div className="min-w-0 flex-1 relative">
            <div
              className={cn(
                "absolute bottom-full left-0 right-0 mb-2 transition-all duration-500 ease-in-out overflow-hidden",
                topAddon
                  ? "max-h-60 opacity-100 translate-y-0"
                  : "max-h-0 opacity-0 translate-y-4 pointer-events-none",
              )}
            >
              {topAddon}
            </div>

            <div className={cn("transition-all duration-300", className)}>{centerContent}</div>
          </div>

          <div
            className={cn(
              "transition-all duration-500 ease-in-out shrink-0",
              rightAction
                ? "opacity-100 scale-100 w-auto translate-x-0"
                : "opacity-0 scale-75 pointer-events-none w-0 -mr-2 translate-x-4",
            )}
          >
            {rightAction}
          </div>
        </div>
      </div>
    </div>
  );
}
