import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

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
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pubs = await ctx.db
      .query("pubs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const pub of pubs) {
      await ctx.db.delete(pub._id);
    }

    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const key of apiKeys) {
      await ctx.db.delete(key._id);
    }

    const connections = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const conn of connections) {
      await ctx.db.delete(conn._id);
    }

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const host of hosts) {
      await ctx.db.delete(host._id);
    }

    const linkTokens = await ctx.db
      .query("linkTokens")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    for (const t of linkTokens) {
      await ctx.db.delete(t._id);
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const s of sessions) {
      await ctx.db.delete(s._id);
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const a of accounts) {
      await ctx.db.delete(a._id);
    }

    const telegramBots = await ctx.db
      .query("telegramBots")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const bot of telegramBots) {
      await ctx.db.delete(bot._id);
    }

    await ctx.db.delete(userId);
  },
});
