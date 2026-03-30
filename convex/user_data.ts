import type { TableNames } from "./_generated/dataModel";

type OwnershipEntry<Owner extends TableNames> = {
  table: Exclude<TableNames, Owner>;
  index: string;
};

export const USER_OWNED_TABLES = [
  { table: "pubs", index: "by_user" },
  { table: "apiKeys", index: "by_user" },
  { table: "connections", index: "by_user" },
  { table: "hosts", index: "by_user" },
  { table: "linkTokens", index: "by_user" },
  { table: "telegramBots", index: "by_user" },
] as const satisfies readonly OwnershipEntry<"users">[];

export const PUB_OWNED_TABLES = [
  { table: "pubFiles", index: "by_pub" },
  { table: "pubAccessTokens", index: "by_pub" },
] as const satisfies readonly OwnershipEntry<"pubs">[];

export const AUTH_TABLES = [
  "authSessions",
  "authAccounts",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
  "authRateLimits",
] as const satisfies readonly TableNames[];
