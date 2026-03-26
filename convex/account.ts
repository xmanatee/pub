import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { deleteAuthAccountsAndDependents, deleteUserSessionsAndDependents } from "./auth_cleanup";
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

async function deletePubFilesByUserPubs(ctx: MutationCtx, userId: Id<"users">) {
  const pubs = await ctx.db
    .query("pubs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const pub of pubs) {
    const files = await ctx.db
      .query("pubFiles")
      .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
      .collect();
    for (const file of files) {
      await ctx.db.delete(file._id);
    }
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

    const currentSessionId = await getAuthSessionId(ctx);
    await deleteAuthAccountsAndDependents(ctx, [account]);
    await deleteUserSessionsAndDependents(ctx, userId, currentSessionId ? [currentSessionId] : []);
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();

    await deletePubFilesByUserPubs(ctx, userId);
    await deleteUserOwnedRows(ctx, userId);
    await deleteAuthAccountsAndDependents(ctx, accounts);
    await deleteUserSessionsAndDependents(ctx, userId);
    await ctx.db.delete(userId);
  },
});
