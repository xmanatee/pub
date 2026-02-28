import { useCallback, useEffect, useRef } from "react";
import {
  classifyHoldGesture,
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
  const lockedRef = useRef(false);

  const sendRef = useRef(sendRecording);
  sendRef.current = sendRecording;
  const cancelRef = useRef(cancelRecording);
  cancelRef.current = cancelRecording;

  const cleanup = useCallback(() => {
    cleanupHoldListeners(listenersRef.current);
    listenersRef.current = null;
    startCoordsRef.current = null;
    pointerIdRef.current = null;
    lockedRef.current = false;
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

      pointerIdRef.current = e.pointerId;
      startCoordsRef.current = { x: e.clientX, y: e.clientY };
      lockedRef.current = false;

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        if (lockedRef.current) {
          cleanup();
          return;
        }

        const start = startCoordsRef.current;
        if (start) {
          const gesture = classifyHoldGesture(
            start.x,
            start.y,
            ev.clientX,
            ev.clientY,
            LOCK_THRESHOLD_PX,
            CANCEL_THRESHOLD_PX,
          );
          if (gesture === "cancel") {
            cancelRef.current();
          } else if (gesture === "lock") {
            // already locked via pointermove — recording bar handles it
          } else {
            sendRef.current();
          }
        } else {
          sendRef.current();
        }

        cleanup();
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        if (lockedRef.current) return;
        const start = startCoordsRef.current;
        if (!start) return;
        const deltaY = start.y - ev.clientY;
        if (deltaY >= LOCK_THRESHOLD_PX) {
          lockedRef.current = true;
        }
      };

      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        cancelRef.current();
        cleanup();
      };

      listenersRef.current = { up: onUp, move: onMove, cancel: onCancel };
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointercancel", onCancel);

      void startRecording()
        .then((started) => {
          if (!started) cleanup();
        })
        .catch((error) => {
          console.error("Failed to start hold-to-record session", error);
          cleanup();
        });
    },
    [disabled, mode, startRecording, cleanup],
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
