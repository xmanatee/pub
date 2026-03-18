import { Fragment } from "react";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import { CB } from "../components/control-bar-classes";
import "../components/control-bar-state.css";
import type { ControlBarFullConfig } from "./control-bar-types";

/**
 * Pure UI Stage for the Control Bar.
 * Occupies full width of the container.
 * Transitions are implicit based on flex-box resizing.
 * Stacks priority-sorted addons above centerContent into a single visual assembly.
 */
export function ControlBarPrimitive({
  leftAction,
  centerContent,
  rightAction,
  addons,
  statusAction,
  isExpanded,
  onStatusClick,
  className,
  shellStyle,
}: ControlBarFullConfig) {
  const hasLeft = Boolean(leftAction);
  const hasRight = Boolean(rightAction);
  const sortedAddons = [...addons].sort((a, b) => a.priority - b.priority);
  const hasAddons = sortedAddons.length > 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <div className="relative mx-auto w-full max-w-4xl">
        {/* Translate wrapper — status button and bar move together */}
        <div
          className={cn(
            "cb-bar-wrapper transition-transform duration-500 ease-in-out",
            isExpanded ? "translate-y-0" : "translate-y-full",
          )}
        >
          {/* Status Slot — always visible, moves with bar */}
          <button
            type="button"
            className={cn(
              "cb-status-slot pointer-events-auto absolute -top-12 right-0 size-9 cursor-pointer overflow-hidden rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl",
              "transition-all duration-500 ease-in-out",
            )}
            onClick={onStatusClick}
            aria-label="Toggle control bar"
          >
            {statusAction}
          </button>

          {/* Bar content — fades when collapsed */}
          <div
            className={cn(
              "transition-all duration-500 ease-in-out",
              isExpanded ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="flex items-end transition-all duration-500 ease-in-out">
              {/* Left Action Slot - Detached */}
              <div
                className={cn(
                  "cb-left-slot shrink-0 transition-all duration-500 ease-in-out",
                  hasLeft ? "w-12 opacity-100 mr-2" : "w-0 opacity-0 pointer-events-none mr-0",
                )}
              >
                <div className="w-12 h-12 flex items-end">{leftAction}</div>
              </div>

              {/* Combined Visual Container */}
              <div
                className={cn(
                  "min-w-0 flex-1 relative flex flex-col overflow-hidden select-none cb-state-border",
                  CB.shellContent,
                  className,
                )}
                style={shellStyle}
              >
                {/* Addons Slot — priority-sorted, each separated */}
                <div
                  className={cn(
                    "transition-all duration-500 ease-in-out",
                    hasAddons
                      ? "max-h-60 opacity-100 translate-y-0"
                      : "max-h-0 opacity-0 translate-y-4 pointer-events-none",
                  )}
                >
                  {sortedAddons.map((addon, i) => (
                    <Fragment key={addon.key}>
                      {addon.content}
                      {i < sortedAddons.length - 1 && <Separator />}
                    </Fragment>
                  ))}
                  {hasAddons && <Separator />}
                </div>

                {/* Center Main Bar Slot */}
                <div className="transition-all duration-300 w-full min-h-12 flex items-center">
                  {centerContent}
                </div>
              </div>

              {/* Right Action Slot - Detached */}
              <div
                className={cn(
                  "shrink-0 transition-all duration-500 ease-in-out",
                  hasRight ? "w-12 opacity-100 ml-2" : "w-0 opacity-0 pointer-events-none ml-0",
                )}
              >
                <div className="w-12 h-12 flex items-end">{rightAction}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
