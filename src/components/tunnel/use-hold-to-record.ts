import { useCallback, useEffect, useRef } from "react";
import {
  cleanupHoldListeners,
  shouldStartKeyboardCapture,
  shouldStartPointerCapture,
} from "./hold-to-record-logic";
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

type HoldListenerEntry = Parameters<typeof cleanupHoldListeners>[0];

export function useHoldToRecord({
  disabled,
  mode,
  startRecording,
  sendRecording,
  cancelRecording,
}: UseHoldToRecordOptions) {
  const startCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const listenersRef = useRef<HoldListenerEntry>(null);

  const cleanup = useCallback(() => {
    cleanupHoldListeners(listenersRef.current, pointerIdRef.current);
    listenersRef.current = null;
    startCoordsRef.current = null;
    pointerIdRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (
        !shouldStartPointerCapture({
          button: e.button,
          disabled,
          mode,
          pointerId: pointerIdRef.current,
          pointerType: e.pointerType,
        })
      ) {
        return;
      }

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
      if (!shouldStartKeyboardCapture({ clickDetail: e.detail, disabled, mode })) return;
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
