import { describe, expect, it } from "vitest";
import { getSeekRatioFromPointer, resolveKeyboardSeekTime } from "./audio-bubble";

describe("audio bubble seek helpers", () => {
  it("clamps pointer seek ratio into 0..1", () => {
    expect(getSeekRatioFromPointer(50, 100, 200)).toBe(0);
    expect(getSeekRatioFromPointer(200, 100, 200)).toBe(0.5);
    expect(getSeekRatioFromPointer(350, 100, 200)).toBe(1);
  });

  it("calculates keyboard seek targets", () => {
    expect(resolveKeyboardSeekTime({ key: "ArrowLeft", currentTime: 10, duration: 60 })).toBe(5);
    expect(resolveKeyboardSeekTime({ key: "ArrowRight", currentTime: 58, duration: 60 })).toBe(60);
    expect(resolveKeyboardSeekTime({ key: "Home", currentTime: 20, duration: 60 })).toBe(0);
    expect(resolveKeyboardSeekTime({ key: "End", currentTime: 20, duration: 60 })).toBe(60);
    expect(resolveKeyboardSeekTime({ key: "Enter", currentTime: 20, duration: 60 })).toBeNull();
  });

  it("returns null for invalid duration", () => {
    expect(resolveKeyboardSeekTime({ key: "ArrowLeft", currentTime: 10, duration: 0 })).toBeNull();
  });
});
