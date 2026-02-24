import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { generateApiKey, hashApiKey, keyPreviewFromKey, MAX_KEY_NAME_LENGTH } from "./utils";

export const getUserByApiKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const keyHash = await hashApiKey(key);

    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
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
    const current = await ctx.db.get(apiKeyId);
    if (!current) return;
    await ctx.db.patch(apiKeyId, { lastUsedAt: Date.now() });
  },
});

export const migrateLegacyKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const legacyKeys = await ctx.db
      .query("apiKeys")
      .filter((q) => q.eq(q.field("keyHash"), undefined))
      .collect();

    let migrated = 0;
    let revoked = 0;

    for (const record of legacyKeys) {
      if (record.key && record.key.length > 0) {
        const keyHash = await hashApiKey(record.key);
        const keyPreview = keyPreviewFromKey(record.key);
        await ctx.db.patch(record._id, { keyHash, keyPreview, key: "" });
        migrated++;
      } else {
        await ctx.db.delete(record._id);
        revoked++;
      }
    }

    return { migrated, revoked, total: legacyKeys.length };
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    if (name.length > MAX_KEY_NAME_LENGTH) {
      throw new Error(`Key name exceeds maximum length of ${MAX_KEY_NAME_LENGTH} characters`);
    }

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
