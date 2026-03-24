import { describe, expect, it } from "vitest";
import { isNotLinkedError } from "./use-telegram-auth";

describe("isNotLinkedError", () => {
  it("detects TELEGRAM_ACCOUNT_NOT_LINKED error message", () => {
    expect(isNotLinkedError(new Error("TELEGRAM_ACCOUNT_NOT_LINKED"))).toBe(true);
  });

  it("detects the error code wrapped in a longer message", () => {
    expect(
      isNotLinkedError(new Error("Auth failed: TELEGRAM_ACCOUNT_NOT_LINKED for user 123")),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isNotLinkedError(new Error("Network error"))).toBe(false);
    expect(isNotLinkedError(new Error("Missing initData"))).toBe(false);
  });

  it("handles string errors", () => {
    expect(isNotLinkedError("TELEGRAM_ACCOUNT_NOT_LINKED")).toBe(true);
    expect(isNotLinkedError("something else")).toBe(false);
  });

  it("handles non-string, non-Error values", () => {
    expect(isNotLinkedError(null)).toBe(false);
    expect(isNotLinkedError(undefined)).toBe(false);
    expect(isNotLinkedError(42)).toBe(false);
  });
});
