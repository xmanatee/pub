import { useCallback, useEffect, useReducer } from "react";
import type { LiveControlBarState, LiveViewMode } from "~/features/live/types/live-types";

/**
 * Edge-triggered state machine for extended options visibility.
 *
 * visible  → on bar expansion (collapsed → expanded)
 * hidden   → on textarea focus, non-idle controlBarState, view change, bar collapse
 *
 * Once hidden, stays hidden until the next bar expansion cycle.
 */

export type ExtendedOptionsEvent =
  | { type: "bar-expanded" }
  | { type: "bar-collapsed" }
  | { type: "dismiss" };

export function extendedOptionsReducer(_prev: boolean, event: ExtendedOptionsEvent): boolean {
  switch (event.type) {
    case "bar-expanded":
      return true;
    case "bar-collapsed":
    case "dismiss":
      return false;
  }
}

export function useExtendedOptionsVisibility({
  controlBarState,
  isBarExpanded,
  viewMode,
}: {
  controlBarState: LiveControlBarState;
  isBarExpanded: boolean;
  viewMode: LiveViewMode;
}) {
  const [visible, dispatch] = useReducer(extendedOptionsReducer, false);

  useEffect(() => {
    dispatch({ type: isBarExpanded ? "bar-expanded" : "bar-collapsed" });
  }, [isBarExpanded]);

  useEffect(() => {
    if (controlBarState !== "idle" && controlBarState !== "connecting") {
      dispatch({ type: "dismiss" });
    }
  }, [controlBarState]);

  useEffect(() => {
    if (viewMode !== "canvas") {
      dispatch({ type: "dismiss" });
    }
  }, [viewMode]);

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);

  return { visible, dismiss };
}
