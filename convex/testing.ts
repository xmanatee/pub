import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
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
    const tables = [
      "pubs",
      "lives",
      "agentPresence",
      "apiKeys",
      "linkTokens",
      "telegramBots",
      "authSessions",
      "authRefreshTokens",
      "authAccounts",
      "authVerificationCodes",
      "authVerifiers",
      "authRateLimits",
    ] as const;
    for (const table of tables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }
    // Also clear users
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.db.delete(user._id);
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

export const debugState = internalQuery({
  args: {},
  handler: async (ctx) => {
    assertTestEnv();
    const users = await ctx.db.query("users").collect();
    const presences = await ctx.db.query("agentPresence").collect();
    const pubs = await ctx.db.query("pubs").collect();
    const apiKeys = await ctx.db.query("apiKeys").collect();
    return {
      users: users.map((u) => ({ _id: u._id, name: u.name })),
      presences: presences.map((p) => ({
        _id: p._id,
        userId: p.userId,
        status: p.status,
        agentName: p.agentName,
        lastHeartbeatAt: p.lastHeartbeatAt,
      })),
      pubs: pubs.map((p) => ({ _id: p._id, slug: p.slug, userId: p.userId })),
      apiKeys: apiKeys.map((k) => ({ _id: k._id, userId: k.userId })),
    };
  },
});
