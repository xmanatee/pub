import { describe, expect, it } from "vitest";
import { collectAuthRateLimitIdentifiers } from "./auth_accounts";
import { selectSessionIdsToDelete } from "./auth_cleanup";

describe("selectSessionIdsToDelete", () => {
  it("removes explicitly kept sessions", () => {
    expect(
      selectSessionIdsToDelete(
        ["a", "b", "c"] as never[],
        ["b"] as never[],
      ),
    ).toEqual(["a", "c"]);
  });
});

describe("auth cleanup coverage", () => {
  it("collects all rate-limit identifiers needed for removed accounts", () => {
    expect(
      collectAuthRateLimitIdentifiers([
        {
          providerAccountId: "oauth-account-id",
          emailVerified: "user@example.com",
          phoneVerified: "+15551234567",
        },
      ]),
    ).toEqual(["oauth-account-id", "user@example.com", "+15551234567"]);
  });
});
