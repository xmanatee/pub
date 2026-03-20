import { useCallback, useEffect, useReducer } from "react";
import type { LiveControlBarState, LiveViewMode } from "~/features/live/types/live-types";

/**
 * Edge-triggered visibility with an explicit toggle path for non-collapsible layouts.
 */

export type ExtendedOptionsEvent =
  | { type: "bar-expanded" }
  | { type: "bar-collapsed" }
  | { type: "dismiss" }
  | { type: "toggle" };

export function extendedOptionsReducer(_prev: boolean, event: ExtendedOptionsEvent): boolean {
  switch (event.type) {
    case "bar-expanded":
      return true;
    case "bar-collapsed":
    case "dismiss":
      return false;
    case "toggle":
      return !_prev;
  }
}

export function useExtendedOptionsVisibility({
  controlBarState,
  isBarExpanded,
  showOnExpand = true,
  viewMode,
}: {
  controlBarState: LiveControlBarState;
  isBarExpanded: boolean;
  showOnExpand?: boolean;
  viewMode: LiveViewMode;
}) {
  const [visible, dispatch] = useReducer(extendedOptionsReducer, false);

  useEffect(() => {
    if (!showOnExpand) return;
    dispatch({ type: isBarExpanded ? "bar-expanded" : "bar-collapsed" });
  }, [isBarExpanded, showOnExpand]);

  useEffect(() => {
    if (!showOnExpand) {
      dispatch({ type: "dismiss" });
    }
  }, [showOnExpand]);

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
  const toggle = useCallback(() => dispatch({ type: "toggle" }), []);

  return { visible, dismiss, toggle };
}
