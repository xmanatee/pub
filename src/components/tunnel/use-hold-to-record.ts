import { useCallback, useRef } from "react";
import type { BarMode } from "./use-control-bar-audio";

const LOCK_THRESHOLD_PX = 70;
const CANCEL_THRESHOLD_PX = 100;

interface UseHoldToRecordOptions {
  disabled: boolean;
  mode: BarMode;
  startRecording: () => void;
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
      if (pid != null) {
        try {
          l.el.releasePointerCapture(pid);
        } catch {}
      }
      listenersRef.current = null;
    }
    startCoordsRef.current = null;
    pointerIdRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || mode !== "idle") return;
      if (pointerIdRef.current != null) return;

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

      startRecording();
    },
    [disabled, mode, startRecording, sendRecording, cancelRecording, cleanup],
  );

  const onContextMenu = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
  }, []);

  return {
    pointerHandlers: { onPointerDown, onContextMenu },
  };
}
