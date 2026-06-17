import { describe, expect, it } from "vitest";
import { getErrorMessage, toError } from "./error-core";

describe("getErrorMessage", () => {
  it("returns non-empty Error messages", () => {
    expect(getErrorMessage(new Error("Nope"), "Fallback")).toBe("Nope");
  });

  it("returns non-empty string errors", () => {
    expect(getErrorMessage("Nope", "Fallback")).toBe("Nope");
  });

  it("falls back for empty or unknown errors", () => {
    expect(getErrorMessage(new Error("  "), "Fallback")).toBe("Fallback");
    expect(getErrorMessage(null, "Fallback")).toBe("Fallback");
  });
});

describe("toError", () => {
  it("preserves Error objects with messages", () => {
    const error = new Error("Nope");
    expect(toError(error, "Fallback")).toBe(error);
  });

  it("wraps string and empty errors", () => {
    expect(toError("Nope", "Fallback").message).toBe("Nope");
    expect(toError(new Error("  "), "Fallback").message).toBe("Fallback");
  });
});
