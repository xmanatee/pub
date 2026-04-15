import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import { CONTROL_BAR_STYLES } from "./control-bar-styles";
import "./control-bar-state.css";
import type { ControlBarAddon, ControlBarSurfaceProps } from "./control-bar-types";

const ADDON_TRANSITION_MS = 500;
/** Stable empty-addon sentinel. Prevents fresh `[]` allocations from defeating `useMemo`. */
const NO_ADDONS: readonly ControlBarAddon[] = [];

function sameAddonKeys(left: readonly ControlBarAddon[], right: readonly ControlBarAddon[]) {
  if (left.length !== right.length) return false;
  return left.every((addon, index) => addon.key === right[index]?.key);
}

export function ControlBarSurface({
  addons = NO_ADDONS,
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
  const sortedAddons = useMemo(
    () =>
      addons.length === 0
        ? NO_ADDONS
        : [...addons].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
    [addons],
  );
  const [renderedAddons, setRenderedAddons] = useState(sortedAddons);
  const [addonsVisible, setAddonsVisible] = useState(sortedAddons.length > 0);
  const addonTimeoutRef = useRef<number | null>(null);
  const hasAddons = renderedAddons.length > 0;
  const showStatusButton = !!statusButton;

  useEffect(() => {
    const currentRendered = renderedAddons;
    if (sameAddonKeys(sortedAddons, currentRendered)) {
      setRenderedAddons(sortedAddons);
      setAddonsVisible(sortedAddons.length > 0);
      return;
    }

    if (addonTimeoutRef.current !== null) {
      window.clearTimeout(addonTimeoutRef.current);
      addonTimeoutRef.current = null;
    }

    if (currentRendered.length === 0) {
      setRenderedAddons(sortedAddons);
      if (sortedAddons.length > 0) {
        const frameId = window.requestAnimationFrame(() => setAddonsVisible(true));
        return () => window.cancelAnimationFrame(frameId);
      }
      setAddonsVisible(false);
      return;
    }

    setAddonsVisible(false);
    addonTimeoutRef.current = window.setTimeout(() => {
      setRenderedAddons(sortedAddons);
      setAddonsVisible(sortedAddons.length > 0);
      addonTimeoutRef.current = null;
    }, ADDON_TRANSITION_MS);

    return () => {
      if (addonTimeoutRef.current !== null) {
        window.clearTimeout(addonTimeoutRef.current);
        addonTimeoutRef.current = null;
      }
    };
  }, [renderedAddons, sortedAddons]);

  useEffect(() => {
    return () => {
      if (addonTimeoutRef.current !== null) {
        window.clearTimeout(addonTimeoutRef.current);
      }
    };
  }, []);

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
                    hasAddons && addonsVisible
                      ? "max-h-[70vh] translate-y-0 opacity-100 overflow-y-auto"
                      : "pointer-events-none max-h-0 translate-y-4 opacity-0",
                  )}
                >
                  {renderedAddons.map((addon, index) => (
                    <Fragment key={addon.key}>
                      {addon.content}
                      {index < renderedAddons.length - 1 && <Separator />}
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
