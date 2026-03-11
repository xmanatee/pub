import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { listFreshOnlinePresences } from "./presence";
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
    return {
      apiKeyId: apiKey._id,
      userId: user._id,
      lastUsedAt: apiKey.lastUsedAt ?? null,
    };
  },
});

export const touchApiKey = internalMutation({
  args: { apiKeyId: v.id("apiKeys") },
  handler: async (ctx, { apiKeyId }) => {
    await ctx.db.patch(apiKeyId, { lastUsedAt: Date.now() });
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

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

    const presences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const freshOnlineIds = new Set(
      listFreshOnlinePresences(presences, Date.now()).map((p) => p._id),
    );
    const agentByKeyId = new Map(
      presences
        .filter((p) => freshOnlineIds.has(p._id))
        .map((p) => [p.apiKeyId as string, p.agentName ?? "Agent"]),
    );

    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPreview: k.keyPreview,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      agentName: agentByKeyId.get(k._id) ?? null,
    }));
  },
});

export const deleteKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const key = await ctx.db.get(id);
    if (!key || key.userId !== userId) throw new Error("API key not found");
    await ctx.db.delete(id);
  },
});
