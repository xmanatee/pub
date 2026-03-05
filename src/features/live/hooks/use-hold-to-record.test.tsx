import { describe, expect, it, vi } from "vitest";
import {
  classifyHoldGesture,
  cleanupHoldListeners,
  shouldStartHold,
  shouldStartKeyboardCapture,
} from "~/features/live/utils/hold-to-record-logic";

describe("hold-to-record logic", () => {
  it("ignores non-primary mouse button pointerdown", () => {
    expect(
      shouldStartHold({
        button: 2,
        disabled: false,
        mode: "idle",
        pointerId: null,
        pointerType: "mouse",
      }),
    ).toBe(false);
  });

  it("starts from keyboard click fallback only", () => {
    expect(
      shouldStartKeyboardCapture({
        clickDetail: 0,
        disabled: false,
        mode: "idle",
      }),
    ).toBe(true);
    expect(
      shouldStartKeyboardCapture({
        clickDetail: 1,
        disabled: false,
        mode: "idle",
      }),
    ).toBe(false);
  });

  it("cleans up document listeners", () => {
    const up = vi.fn();
    const move = vi.fn();
    const cancel = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("document", { removeEventListener });

    cleanupHoldListeners({ up, move, cancel });

    expect(removeEventListener).toHaveBeenCalledWith("pointerup", up);
    expect(removeEventListener).toHaveBeenCalledWith("pointermove", move);
    expect(removeEventListener).toHaveBeenCalledWith("pointercancel", cancel);

    vi.unstubAllGlobals();
  });

  it("cleanupHoldListeners is a no-op for null", () => {
    expect(() => cleanupHoldListeners(null)).not.toThrow();
  });
});

describe("classifyHoldGesture", () => {
  const lock = 70;
  const cancel = 100;

  it("returns 'send' for small movement", () => {
    expect(classifyHoldGesture(100, 100, 95, 95, lock, cancel)).toBe("send");
  });

  it("returns 'cancel' for large leftward drag", () => {
    expect(classifyHoldGesture(200, 100, 90, 100, lock, cancel)).toBe("cancel");
  });

  it("returns 'lock' for large upward drag", () => {
    expect(classifyHoldGesture(100, 200, 100, 120, lock, cancel)).toBe("lock");
  });

  it("lock takes precedence over cancel when both thresholds met", () => {
    // deltaX = 150 (>= cancel), deltaY = 100 (>= lock) — lock wins
    expect(classifyHoldGesture(200, 200, 50, 100, lock, cancel)).toBe("lock");
  });

  it("returns 'send' at exact boundary (below thresholds)", () => {
    // deltaX = 99 (< cancel), deltaY = 69 (< lock)
    expect(classifyHoldGesture(100, 100, 1, 31, lock, cancel)).toBe("send");
  });

  it("returns 'lock' at exact lock threshold", () => {
    expect(classifyHoldGesture(100, 100, 100, 30, lock, cancel)).toBe("lock");
  });

  it("returns 'cancel' at exact cancel threshold", () => {
    expect(classifyHoldGesture(200, 100, 100, 100, lock, cancel)).toBe("cancel");
  });
});
