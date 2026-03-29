import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { generateHexToken } from "./utils";

const PUB_ACCESS_TOKEN_EXPIRY_MS = 10 * 60 * 1000;

export const deleteExpiredToken = internalMutation({
  args: { id: v.id("pubAccessTokens") },
  handler: async (ctx, { id }) => {
    const record = await ctx.db.get(id);
    if (record && record.expiresAt < Date.now()) {
      await ctx.db.delete(id);
    }
  },
});

export const createOwnerContentAccessToken = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    const now = Date.now();
    const existing = await ctx.db
      .query("pubAccessTokens")
      .withIndex("by_user_pub", (q) => q.eq("userId", userId).eq("pubId", pub._id))
      .collect();

    let activeToken: { token: string; expiresAt: number } | null = null;
    for (const record of existing) {
      if (record.expiresAt <= now) {
        await ctx.db.delete(record._id);
        continue;
      }
      if (activeToken === null || record.expiresAt > activeToken.expiresAt) {
        activeToken = { token: record.token, expiresAt: record.expiresAt };
      }
    }

    if (activeToken) {
      return activeToken;
    }

    const token = generateHexToken();
    const expiresAt = now + PUB_ACCESS_TOKEN_EXPIRY_MS;
    const id = await ctx.db.insert("pubAccessTokens", {
      pubId: pub._id,
      userId,
      token,
      createdAt: now,
      expiresAt,
    });

    await ctx.scheduler.runAt(expiresAt, internal.pubAccessTokens.deleteExpiredToken, { id });

    return { token, expiresAt };
  },
});

export const getByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return ctx.db
      .query("pubAccessTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
  },
});
