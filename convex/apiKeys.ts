import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { generateApiKey, hashApiKey, keyPreviewFromKey } from "./utils";

export const getUserByApiKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const keyHash = await hashApiKey(key);

    let apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
      .unique();

    // Backward compatibility: support older records that still contain plaintext keys.
    if (!apiKey) {
      apiKey = await ctx.db
        .query("apiKeys")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
    }

    if (!apiKey) return null;
    const user = await ctx.db.get(apiKey.userId);
    if (!user) return null;
    return { apiKeyId: apiKey._id, userId: user._id };
  },
});

export const touchApiKey = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), key: v.optional(v.string()) },
  handler: async (ctx, { apiKeyId, key }) => {
    const current = await ctx.db.get(apiKeyId);
    if (!current) return;

    const patch: Record<string, unknown> = { lastUsedAt: Date.now() };

    // Migrate legacy plaintext keys: hash the key and clear the plaintext field.
    if (!current.keyHash && key) {
      patch.keyHash = await hashApiKey(key);
      patch.keyPreview = keyPreviewFromKey(key);
      patch.key = "";
    }

    await ctx.db.patch(apiKeyId, patch);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const keyPreview = keyPreviewFromKey(key);
    await ctx.db.insert("apiKeys", {
      userId,
      keyHash,
      keyPreview,
      name,
      createdAt: Date.now(),
    });

    return { key };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPreview: k.keyPreview ?? (k.key ? keyPreviewFromKey(k.key) : "pub_****...****"),
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
  },
});

export const remove = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const key = await ctx.db.get(id);
    if (!key || key.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
