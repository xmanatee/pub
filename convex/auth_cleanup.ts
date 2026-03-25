import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { AuthAccountDocLike } from "./auth_accounts";
import { collectAuthRateLimitIdentifiers } from "./auth_accounts";

export function selectSessionIdsToDelete(
  sessionIds: readonly Id<"authSessions">[],
  keepSessionIds: readonly Id<"authSessions">[],
): Id<"authSessions">[] {
  const keep = new Set(keepSessionIds);
  return sessionIds.filter((sessionId) => !keep.has(sessionId));
}

export async function deleteAuthAccountsAndDependents(
  ctx: MutationCtx,
  accounts: readonly AuthAccountDocLike[],
): Promise<void> {
  for (const account of accounts) {
    const verificationCodes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const verificationCode of verificationCodes) {
      await ctx.db.delete(verificationCode._id);
    }
  }

  const rateLimitIdentifiers = collectAuthRateLimitIdentifiers(accounts);
  for (const identifier of rateLimitIdentifiers) {
    const rows = await ctx.db
      .query("authRateLimits")
      .withIndex("identifier", (q) => q.eq("identifier", identifier))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }

  for (const account of accounts) {
    await ctx.db.delete(account._id);
  }
}

export async function deleteUserSessionsAndDependents(
  ctx: MutationCtx,
  userId: Id<"users">,
  keepSessionIds: readonly Id<"authSessions">[] = [],
): Promise<void> {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const sessionIdsToDelete = selectSessionIdsToDelete(
    sessions.map((session) => session._id),
    keepSessionIds,
  );
  if (sessionIdsToDelete.length === 0) return;

  for (const sessionId of sessionIdsToDelete) {
    const refreshTokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const refreshToken of refreshTokens) {
      await ctx.db.delete(refreshToken._id);
    }
  }

  const sessionIdSet = new Set(sessionIdsToDelete);
  // The auth package does not expose a sessionId index for authVerifiers, so
  // strict cleanup requires scanning the table and removing only the rows that
  // still point at deleted sessions.
  const verifiers = await ctx.db.query("authVerifiers").collect();
  for (const verifier of verifiers) {
    if (verifier.sessionId && sessionIdSet.has(verifier.sessionId)) {
      await ctx.db.delete(verifier._id);
    }
  }

  for (const sessionId of sessionIdsToDelete) {
    await ctx.db.delete(sessionId);
  }
}
