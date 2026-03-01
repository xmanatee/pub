import type { BarMode } from "./control-bar-audio-machine";

interface ShouldStartHoldInput {
  button: number;
  disabled: boolean;
  mode: BarMode;
  pointerId: number | null;
  pointerType: string;
}

export function shouldStartHold(input: ShouldStartHoldInput): boolean {
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
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
}

export function cleanupHoldListeners(listeners: HoldListeners | null): void {
  if (!listeners) return;
  document.removeEventListener("pointerup", listeners.up);
  document.removeEventListener("pointermove", listeners.move);
  document.removeEventListener("pointercancel", listeners.cancel);
}

export type HoldGesture = "send" | "cancel" | "lock";

export function classifyHoldGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  lockPx: number,
  cancelPx: number,
): HoldGesture {
  const deltaX = startX - endX;
  const deltaY = startY - endY;
  if (deltaY >= lockPx) return "lock";
  if (deltaX >= cancelPx) return "cancel";
  return "send";
}
