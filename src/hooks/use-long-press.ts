import { useCallback, useEffect, useRef } from "react";
import {
  createState,
  endTouch,
  handleContextMenu,
  handlePointerDown,
  handlePointerMove,
  type LongPressState,
} from "./long-press-logic";

interface UseLongPressOptions {
  onActivate: () => void;
}

function shouldIgnoreLongPressTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-long-press-ignore='true']")) return true;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"),
  );
}

export function useLongPress({ onActivate }: UseLongPressOptions) {
  const stateRef = useRef<LongPressState>(createState());

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (shouldIgnoreLongPressTarget(e.target)) return;
      handlePointerDown(stateRef.current, e.pointerType, e.clientX, e.clientY, onActivate);
    },
    [onActivate],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    handlePointerMove(stateRef.current, e.clientX, e.clientY);
  }, []);

  const onPointerUp = useCallback(() => endTouch(stateRef.current), []);
  const onPointerCancel = useCallback(() => endTouch(stateRef.current), []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (shouldIgnoreLongPressTarget(e.target)) return;
      e.preventDefault();
      handleContextMenu(stateRef.current, onActivate);
    },
    [onActivate],
  );

  useEffect(() => () => endTouch(stateRef.current), []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu };
}
