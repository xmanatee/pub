import { describe, expect, it, vi } from "vitest";
import {
  cleanupHoldListeners,
  shouldStartKeyboardCapture,
  shouldStartPointerCapture,
} from "./hold-to-record-logic";

describe("hold-to-record logic", () => {
  it("ignores non-primary mouse button pointerdown", () => {
    expect(
      shouldStartPointerCapture({
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

  it("cleans listeners and releases pointer capture", () => {
    const removeEventListener = vi.fn();
    const hasPointerCapture = vi.fn(() => true);
    const releasePointerCapture = vi.fn();
    const listeners = {
      cancel: vi.fn(),
      el: {
        hasPointerCapture,
        releasePointerCapture,
        removeEventListener,
      },
      up: vi.fn(),
    };

    cleanupHoldListeners(listeners, 11);

    expect(removeEventListener).toHaveBeenCalledWith("pointerup", listeners.up);
    expect(removeEventListener).toHaveBeenCalledWith("pointercancel", listeners.cancel);
    expect(hasPointerCapture).toHaveBeenCalledWith(11);
    expect(releasePointerCapture).toHaveBeenCalledWith(11);
  });
});
