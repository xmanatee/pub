import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { USER_OWNED_TABLES } from "./user_data";

async function deleteUserOwnedRows(ctx: MutationCtx, userId: Id<"users">) {
  for (const { table, index } of USER_OWNED_TABLES) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic table iteration
    const rows = await (ctx.db.query(table) as any)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic table iteration
      .withIndex(index, (q: any) => q.eq("userId", userId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}

async function invalidateSessionsExcept(
  ctx: MutationCtx,
  userId: Id<"users">,
  keepSessionId: Id<"authSessions"> | null,
) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const session of sessions) {
    if (session._id === keepSessionId) continue;
    const refreshTokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const rt of refreshTokens) {
      await ctx.db.delete(rt._id);
    }
    await ctx.db.delete(session._id);
  }
}

export const disconnectProvider = mutation({
  args: { provider: v.string() },
  handler: async (ctx, { provider }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();

    if (accounts.length <= 1) {
      throw new Error("Cannot disconnect your only login method");
    }

    const account = accounts.find((a) => a.provider === provider);
    if (!account) throw new Error("Provider not connected");

    await ctx.db.delete(account._id);

    const currentSessionId = await getAuthSessionId(ctx);
    await invalidateSessionsExcept(ctx, userId, currentSessionId);
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await deleteUserOwnedRows(ctx, userId);
    await invalidateSessionsExcept(ctx, userId, null);

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const a of accounts) {
      await ctx.db.delete(a._id);
    }

    await ctx.db.delete(userId);
  },
});
