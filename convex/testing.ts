import { v } from "convex/values";
import type { TableNames } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { AUTH_TABLES, USER_OWNED_TABLES } from "./user_data";
import { generateApiKey, hashApiKey, keyPreviewFromKey } from "./utils";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function assertTestEnv() {
  if (!process.env.IS_TEST) {
    throw new Error("Test functions are only available in test environments");
  }
}

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertTestEnv();
    const tables: TableNames[] = [
      ...USER_OWNED_TABLES.map((t) => t.table),
      ...AUTH_TABLES,
      "users",
    ];
    for (const table of tables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }
  },
});

export const seedUser = internalMutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    assertTestEnv();
    const userId = await ctx.db.insert("users", {
      name: name ?? "Test User",
      email: "test@example.com",
    });
    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    const apiKeyId = await ctx.db.insert("apiKeys", {
      userId,
      keyHash,
      keyPreview: keyPreviewFromKey(rawKey),
      name: "test-key",
      createdAt: Date.now(),
    });

    // Create auth session + refresh token for browser auth
    const now = Date.now();
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: now + THIRTY_DAYS_MS,
    });
    const refreshTokenId = await ctx.db.insert("authRefreshTokens", {
      sessionId,
      expirationTime: now + THIRTY_DAYS_MS,
    });

    const refreshToken = `${refreshTokenId}|${sessionId}`;

    return { userId, apiKey: rawKey, apiKeyId, refreshToken };
  },
});

export const seedExtraApiKey = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    assertTestEnv();
    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    const apiKeyId = await ctx.db.insert("apiKeys", {
      userId,
      keyHash,
      keyPreview: keyPreviewFromKey(rawKey),
      name: "test-key-extra",
      createdAt: Date.now(),
    });
    return { apiKey: rawKey, apiKeyId };
  },
});
