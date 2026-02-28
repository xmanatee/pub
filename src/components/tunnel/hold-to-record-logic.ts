import type { BarMode } from "./control-bar-audio-machine";

interface ShouldStartPointerCaptureInput {
  button: number;
  disabled: boolean;
  mode: BarMode;
  pointerId: number | null;
  pointerType: string;
}

export function shouldStartPointerCapture(input: ShouldStartPointerCaptureInput): boolean {
  if (input.disabled || input.mode !== "idle") return false;
  if (input.pointerId != null) return false;
  if (input.pointerType === "mouse" && input.button !== 0) return false;
  return true;
}

interface ShouldStartKeyboardCaptureInput {
  clickDetail: number;
  disabled: boolean;
  mode: BarMode;
}

export function shouldStartKeyboardCapture(input: ShouldStartKeyboardCaptureInput): boolean {
  if (input.disabled || input.mode !== "idle") return false;
  return input.clickDetail === 0;
}

export interface HoldListeners {
  cancel: (event: PointerEvent) => void;
  el: {
    hasPointerCapture: (pointerId: number) => boolean;
    releasePointerCapture: (pointerId: number) => void;
    removeEventListener: (
      type: "pointercancel" | "pointerup",
      cb: (event: PointerEvent) => void,
    ) => void;
  };
  up: (event: PointerEvent) => void;
}

export function cleanupHoldListeners(
  listeners: HoldListeners | null,
  pointerId: number | null,
): void {
  if (!listeners) return;
  listeners.el.removeEventListener("pointerup", listeners.up);
  listeners.el.removeEventListener("pointercancel", listeners.cancel);
  if (pointerId != null && listeners.el.hasPointerCapture(pointerId)) {
    listeners.el.releasePointerCapture(pointerId);
  }
}
