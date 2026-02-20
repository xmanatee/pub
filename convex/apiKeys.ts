import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { auth } from "./auth";

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pub_${key}`;
}

export const getUserByApiKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!apiKey) return null;
    const user = await ctx.db.get(apiKey.userId);
    if (!user) return null;
    return { apiKeyId: apiKey._id, userId: user._id };
  },
});

export const touchApiKey = internalMutation({
  args: { apiKeyId: v.id("apiKeys") },
  handler: async (ctx, { apiKeyId }) => {
    await ctx.db.patch(apiKeyId, { lastUsedAt: Date.now() });
  },
});

export const createApiKeyInternal = internalMutation({
  args: { userId: v.id("users"), key: v.string(), name: v.string() },
  handler: async (ctx, { userId, key, name }) => {
    return ctx.db.insert("apiKeys", {
      userId,
      key,
      name,
      createdAt: Date.now(),
    });
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const key = generateApiKey();
    await ctx.db.insert("apiKeys", {
      userId,
      key,
      name,
      createdAt: Date.now(),
    });

    return { key };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPreview: `${k.key.slice(0, 8)}...${k.key.slice(-4)}`,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
  },
});

export const remove = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const key = await ctx.db.get(id);
    if (!key || key.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
