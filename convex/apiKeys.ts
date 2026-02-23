import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pub_${key}`;
}

function keyPreviewFromKey(key: string): string {
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

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
    const patch: {
      lastUsedAt: number;
      keyHash?: string;
      keyPreview?: string;
      key?: undefined;
    } = { lastUsedAt: Date.now() };

    // Opportunistically migrate legacy plaintext keys during normal key usage.
    const current = await ctx.db.get(apiKeyId);
    if (current && !current.keyHash && key) {
      patch.keyHash = await hashApiKey(key);
      patch.keyPreview = keyPreviewFromKey(key);
      patch.key = undefined;
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
