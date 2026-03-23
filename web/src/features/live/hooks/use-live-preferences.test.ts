import { describe, expect, it } from "vitest";
import { readStoredBoolean, readStoredString } from "./use-live-preferences";

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

describe("readStoredString", () => {
  it("returns the stored value", () => {
    expect(readStoredString("key", makeGetItem({ key: "my-agent" }))).toBe("my-agent");
  });

  it("returns null for missing key", () => {
    expect(readStoredString("missing", makeGetItem({}))).toBe(null);
  });
});
