import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";

export const findByProviderAccount = internalQuery({
  args: { provider: v.string(), providerAccountId: v.string() },
  handler: async (ctx, { provider, providerAccountId }) =>
    ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", provider).eq("providerAccountId", providerAccountId),
      )
      .unique(),
});

export type AuthAccountDocLike = {
  _id: Id<"authAccounts">;
  userId: Id<"users">;
  provider: string;
  providerAccountId: string;
  emailVerified?: string;
  phoneVerified?: string;
};

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveLinkedProviderIdentifier(
  account: Pick<AuthAccountDocLike, "providerAccountId" | "emailVerified" | "phoneVerified">,
): string | undefined {
  return (
    nonEmpty(account.emailVerified) ??
    nonEmpty(account.phoneVerified) ??
    nonEmpty(account.providerAccountId)
  );
}

export function collectAuthRateLimitIdentifiers(
  accounts: readonly Pick<
    AuthAccountDocLike,
    "providerAccountId" | "emailVerified" | "phoneVerified"
  >[],
): string[] {
  const identifiers = new Set<string>();
  for (const account of accounts) {
    for (const value of [account.providerAccountId, account.emailVerified, account.phoneVerified]) {
      const normalized = nonEmpty(value);
      if (normalized) identifiers.add(normalized);
    }
  }
  return [...identifiers];
}
