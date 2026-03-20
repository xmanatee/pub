import { Fragment } from "react";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import { CONTROL_BAR_STYLES } from "./control-bar-styles";
import "./control-bar-state.css";
import type { ControlBarSurfaceProps } from "./control-bar-types";

export function ControlBarSurface({
  addons = [],
  className,
  expanded,
  leftAction,
  mainContent,
  rightAction,
  shellStyle,
  statusButton,
}: ControlBarSurfaceProps) {
  const hasLeft = Boolean(leftAction);
  const hasRight = Boolean(rightAction);
  const sortedAddons = [...addons].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const hasAddons = sortedAddons.length > 0;
  const showStatusButton = statusButton && !statusButton.hidden;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <div className="relative mx-auto w-full max-w-4xl">
        <div
          className={cn(
            "cb-bar-wrapper transition-transform duration-500 ease-in-out",
            expanded ? "translate-y-0" : "translate-y-full",
          )}
        >
          {showStatusButton ? (
            <button
              type="button"
              className={cn(
                "cb-status-slot pointer-events-auto absolute -top-12 right-0 size-9 cursor-pointer overflow-hidden rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl",
                "transition-all duration-500 ease-in-out",
              )}
              onClick={statusButton.onClick}
              aria-label={statusButton.ariaLabel ?? "Toggle control bar"}
            >
              {statusButton.content}
            </button>
          ) : null}

          <div
            className={cn(
              "transition-all duration-500 ease-in-out",
              expanded ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="flex items-end transition-all duration-500 ease-in-out">
              <div
                className={cn(
                  "cb-left-slot shrink-0 transition-all duration-500 ease-in-out",
                  hasLeft ? "w-12 opacity-100 mr-2" : "w-0 opacity-0 pointer-events-none mr-0",
                )}
              >
                <div className="flex h-12 w-12 items-end">{leftAction}</div>
              </div>

              <div
                className={cn(
                  "cb-state-border relative flex min-w-0 flex-1 select-none flex-col overflow-hidden",
                  CONTROL_BAR_STYLES.shellContent,
                  className,
                )}
                style={shellStyle}
              >
                <div
                  className={cn(
                    "transition-all duration-500 ease-in-out",
                    hasAddons
                      ? "max-h-60 translate-y-0 opacity-100"
                      : "pointer-events-none max-h-0 translate-y-4 opacity-0",
                  )}
                >
                  {sortedAddons.map((addon, index) => (
                    <Fragment key={addon.key}>
                      {addon.content}
                      {index < sortedAddons.length - 1 && <Separator />}
                    </Fragment>
                  ))}
                  {hasAddons && <Separator />}
                </div>

                <div className="flex min-h-12 w-full items-center transition-all duration-300">
                  {mainContent}
                </div>
              </div>

              <div
                className={cn(
                  "shrink-0 transition-all duration-500 ease-in-out",
                  hasRight ? "w-12 opacity-100 ml-2" : "w-0 opacity-0 pointer-events-none ml-0",
                )}
              >
                <div className="flex h-12 w-12 items-end">{rightAction}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
