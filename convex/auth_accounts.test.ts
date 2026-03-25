import { describe, expect, it } from "vitest";
import { collectAuthRateLimitIdentifiers, resolveLinkedProviderIdentifier } from "./auth_accounts";

describe("resolveLinkedProviderIdentifier", () => {
  it("prefers verified email when present", () => {
    expect(
      resolveLinkedProviderIdentifier({
        providerAccountId: "github-123",
        emailVerified: "user@example.com",
      }),
    ).toBe("user@example.com");
  });

  it("falls back to verified phone before provider account id", () => {
    expect(
      resolveLinkedProviderIdentifier({
        providerAccountId: "telegram-123",
        phoneVerified: "+15551234567",
      }),
    ).toBe("+15551234567");
  });

  it("uses provider account id instead of unrelated profile fields", () => {
    expect(
      resolveLinkedProviderIdentifier({
        providerAccountId: "123456789",
      }),
    ).toBe("123456789");
  });
});

describe("collectAuthRateLimitIdentifiers", () => {
  it("deduplicates and trims identifiers collected from auth accounts", () => {
    expect(
      collectAuthRateLimitIdentifiers([
        {
          providerAccountId: " user@example.com ",
          emailVerified: "user@example.com",
        },
        {
          providerAccountId: "12345",
          phoneVerified: " +15551234567 ",
        },
      ]),
    ).toEqual(["user@example.com", "12345", "+15551234567"]);
  });
});
