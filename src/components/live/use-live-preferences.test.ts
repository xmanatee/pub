import { describe, expect, it } from "vitest";
import { LIVE_ANIMATION_STYLES } from "./types";
import { readStoredAnimationStyle, readStoredBoolean } from "./use-live-preferences";

function makeGetItem(store: Record<string, string>): (key: string) => string | null {
  return (key) => store[key] ?? null;
}

describe("readStoredBoolean", () => {
  it("returns true for '1'", () => {
    expect(readStoredBoolean("key", false, makeGetItem({ key: "1" }))).toBe(true);
  });

  it("returns false for '0'", () => {
    expect(readStoredBoolean("key", true, makeGetItem({ key: "0" }))).toBe(false);
  });

  it("returns fallback for missing key", () => {
    expect(readStoredBoolean("missing", true, makeGetItem({}))).toBe(true);
    expect(readStoredBoolean("missing", false, makeGetItem({}))).toBe(false);
  });

  it("returns fallback for unrecognized value", () => {
    expect(readStoredBoolean("key", true, makeGetItem({ key: "maybe" }))).toBe(true);
  });
});

describe("readStoredAnimationStyle", () => {
  const storageKey = "pubblue:live:animation-style";

  it("returns stored valid style", () => {
    expect(readStoredAnimationStyle(makeGetItem({ [storageKey]: "aurora" }))).toBe("aurora");
    expect(readStoredAnimationStyle(makeGetItem({ [storageKey]: "orb" }))).toBe("orb");
    expect(readStoredAnimationStyle(makeGetItem({ [storageKey]: "blob" }))).toBe("blob");
  });

  it("returns default for missing key", () => {
    expect(readStoredAnimationStyle(makeGetItem({}))).toBe(LIVE_ANIMATION_STYLES[0]);
  });

  it("returns default for invalid value", () => {
    expect(readStoredAnimationStyle(makeGetItem({ [storageKey]: "sparkle" }))).toBe(
      LIVE_ANIMATION_STYLES[0],
    );
  });

  it("returns default for empty string", () => {
    expect(readStoredAnimationStyle(makeGetItem({ [storageKey]: "" }))).toBe(
      LIVE_ANIMATION_STYLES[0],
    );
  });
});
