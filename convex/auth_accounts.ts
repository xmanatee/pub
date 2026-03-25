import type { Id } from "./_generated/dataModel";

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
  accounts: readonly Pick<AuthAccountDocLike, "providerAccountId" | "emailVerified" | "phoneVerified">[],
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
