import { useCallback, useEffect, useRef } from "react";
import type { BarMode } from "./use-control-bar-audio";

const LOCK_THRESHOLD_PX = 70;
const CANCEL_THRESHOLD_PX = 100;

interface UseHoldToRecordOptions {
  disabled: boolean;
  mode: BarMode;
  startRecording: () => Promise<boolean>;
  sendRecording: () => void;
  cancelRecording: () => void;
}

export function useHoldToRecord({
  disabled,
  mode,
  startRecording,
  sendRecording,
  cancelRecording,
}: UseHoldToRecordOptions) {
  const startCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const listenersRef = useRef<{
    el: HTMLElement;
    up: (e: PointerEvent) => void;
    cancel: (e: PointerEvent) => void;
  } | null>(null);

  const cleanup = useCallback(() => {
    const l = listenersRef.current;
    if (l) {
      l.el.removeEventListener("pointerup", l.up);
      l.el.removeEventListener("pointercancel", l.cancel);
      const pid = pointerIdRef.current;
      if (pid != null && l.el.hasPointerCapture(pid)) l.el.releasePointerCapture(pid);
      listenersRef.current = null;
    }
    startCoordsRef.current = null;
    pointerIdRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || mode !== "idle") return;
      if (pointerIdRef.current != null) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      pointerIdRef.current = e.pointerId;
      startCoordsRef.current = { x: e.clientX, y: e.clientY };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        const start = startCoordsRef.current;

        if (start) {
          const deltaX = start.x - ev.clientX;
          const deltaY = start.y - ev.clientY;

          if (deltaX >= CANCEL_THRESHOLD_PX) {
            cancelRecording();
          } else if (deltaY >= LOCK_THRESHOLD_PX) {
            // lock: recording continues, standard recording bar takes over
          } else {
            sendRecording();
          }
        } else {
          sendRecording();
        }

        cleanup();
      };

      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        cancelRecording();
        cleanup();
      };

      listenersRef.current = { el, up: onUp, cancel: onCancel };
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onCancel);

      void startRecording().then((started) => {
        if (!started) cleanup();
      });
    },
    [disabled, mode, startRecording, sendRecording, cancelRecording, cleanup],
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || mode !== "idle") return;
      if (e.detail !== 0) return;
      void startRecording();
    },
    [disabled, mode, startRecording],
  );

  const onContextMenu = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  return {
    pointerHandlers: { onPointerDown, onClick, onContextMenu },
  };
}
