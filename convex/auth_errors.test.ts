import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  isTelegramNotLinkedError,
  TELEGRAM_ACCOUNT_NOT_LINKED,
  telegramNotLinkedError,
} from "./auth_errors";

describe("auth_errors", () => {
  it("telegramNotLinkedError carries the structured payload", () => {
    const err = telegramNotLinkedError();
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data).toEqual({ code: TELEGRAM_ACCOUNT_NOT_LINKED });
  });

  it("isTelegramNotLinkedError accepts the matching ConvexError", () => {
    expect(isTelegramNotLinkedError(telegramNotLinkedError())).toBe(true);
  });

  it("rejects plain Errors regardless of message", () => {
    expect(isTelegramNotLinkedError(new Error(TELEGRAM_ACCOUNT_NOT_LINKED))).toBe(false);
  });

  it("rejects ConvexErrors with a different code", () => {
    expect(isTelegramNotLinkedError(new ConvexError({ code: "OTHER" }))).toBe(false);
  });

  it("rejects ConvexErrors carrying a non-object payload", () => {
    expect(isTelegramNotLinkedError(new ConvexError(TELEGRAM_ACCOUNT_NOT_LINKED))).toBe(false);
  });
});
