import { describe, expect, it } from "vitest";
import { isMinorOrMajorBump } from "./version-check.js";

describe("isMinorOrMajorBump", () => {
  it("returns true for major bump", () => {
    expect(isMinorOrMajorBump("2.0.0", "1.0.0")).toBe(true);
    expect(isMinorOrMajorBump("1.0.0", "0.7.2")).toBe(true);
  });

  it("returns true when minor advances by 2+", () => {
    expect(isMinorOrMajorBump("0.9.0", "0.7.2")).toBe(true);
    expect(isMinorOrMajorBump("1.3.0", "1.1.0")).toBe(true);
  });

  it("returns false when minor advances by 1", () => {
    expect(isMinorOrMajorBump("0.8.0", "0.7.2")).toBe(false);
    expect(isMinorOrMajorBump("1.1.0", "1.0.0")).toBe(false);
  });

  it("returns false for patch-only bump", () => {
    expect(isMinorOrMajorBump("1.0.1", "1.0.0")).toBe(false);
    expect(isMinorOrMajorBump("0.7.3", "0.7.2")).toBe(false);
  });

  it("returns false for equal versions", () => {
    expect(isMinorOrMajorBump("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false for older versions", () => {
    expect(isMinorOrMajorBump("0.7.0", "0.7.2")).toBe(false);
  });
});
