import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const LINK_TOKEN_EXPIRY_MS = 10 * 60 * 1000;

export const deleteExpiredToken = internalMutation({
  args: { id: v.id("linkTokens") },
  handler: async (ctx, { id }) => {
    const record = await ctx.db.get(id);
    if (record && record.expiresAt < Date.now()) {
      await ctx.db.delete(id);
    }
  },
});

export const createLinkToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const token = generateToken();
    const id = await ctx.db.insert("linkTokens", {
      userId,
      token,
      expiresAt: Date.now() + LINK_TOKEN_EXPIRY_MS,
    });

    await ctx.scheduler.runAt(
      Date.now() + LINK_TOKEN_EXPIRY_MS,
      internal.linking.deleteExpiredToken,
      { id },
    );

    return { token };
  },
});

export const getLinkTokenInfo = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const record = await ctx.db
      .query("linkTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!record || record.expiresAt < Date.now()) {
      return { valid: false as const };
    }

    const user = await ctx.db.get(record.userId);
    return { valid: true as const, userName: user?.name as string | undefined };
  },
});

export const completeMerge = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const targetUserId = await getAuthUserId(ctx);
    if (!targetUserId) throw new Error("Not authenticated");

    const record = await ctx.db
      .query("linkTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!record || record.expiresAt < Date.now()) {
      throw new Error("Invalid or expired link token");
    }

    const sourceUserId = record.userId;
    await ctx.db.delete(record._id);

    if (sourceUserId === targetUserId) return;

    const pubs = await ctx.db
      .query("pubs")
      .withIndex("by_user", (q) => q.eq("userId", sourceUserId))
      .collect();
    for (const pub of pubs) {
      await ctx.db.patch(pub._id, { userId: targetUserId });
    }

    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", sourceUserId))
      .collect();
    for (const key of apiKeys) {
      await ctx.db.patch(key._id, { userId: targetUserId });
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", sourceUserId))
      .collect();
    for (const account of accounts) {
      await ctx.db.patch(account._id, { userId: targetUserId });
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", sourceUserId))
      .collect();
    for (const session of sessions) {
      await ctx.db.patch(session._id, { userId: targetUserId });
    }

    const connections = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", sourceUserId))
      .collect();
    for (const conn of connections) {
      await ctx.db.patch(conn._id, { userId: targetUserId });
    }

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", sourceUserId))
      .collect();
    for (const host of hosts) {
      await ctx.db.patch(host._id, { userId: targetUserId });
    }

    await ctx.db.delete(sourceUserId);
  },
});
