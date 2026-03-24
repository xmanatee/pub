import type { TableNames } from "./_generated/dataModel";

type UserOwnedTable = {
  table: Exclude<TableNames, "users">;
  index: string;
};

export const USER_OWNED_TABLES = [
  { table: "pubs", index: "by_user" },
  { table: "apiKeys", index: "by_user" },
  { table: "connections", index: "by_user" },
  { table: "hosts", index: "by_user" },
  { table: "linkTokens", index: "by_user" },
  { table: "telegramBots", index: "by_user" },
] as const satisfies readonly UserOwnedTable[];

export const AUTH_TABLES = [
  "authSessions",
  "authAccounts",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
  "authRateLimits",
] as const satisfies readonly TableNames[];
