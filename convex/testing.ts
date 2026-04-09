import { v } from "convex/values";
import type { TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { deletePubOwnedRowsByUser, deleteUserOwnedRows } from "./account";
import { duplicatePubCore } from "./pubs";
import { AUTH_TABLES, PUB_OWNED_TABLES, USER_OWNED_TABLES } from "./user_data";
import { generateApiKey, hashApiKey, keyPreviewFromKey } from "./utils";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function assertTestEnv() {
  if (!process.env.IS_TEST) {
    throw new Error("Test functions are only available in test environments");
  }
}

const CLEARABLE_TABLES: TableNames[] = [
  ...USER_OWNED_TABLES.map((t) => t.table),
  ...PUB_OWNED_TABLES.map((t) => t.table),
  ...AUTH_TABLES,
  "users",
];

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertTestEnv();
    for (const table of CLEARABLE_TABLES) {
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

export const seedPubs = internalMutation({
  args: {
    userId: v.id("users"),
    count: v.number(),
    slugPrefix: v.string(),
  },
  handler: async (ctx, { userId, count, slugPrefix }) => {
    assertTestEnv();
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("pubs", {
        userId,
        slug: `${slugPrefix}-${i}`,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
        viewCount: 0,
      });
    }
  },
});

export const deleteUserAccount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    assertTestEnv();
    await deletePubOwnedRowsByUser(ctx.db, userId);
    await deleteUserOwnedRows(ctx.db, userId);
    await ctx.db.delete(userId);
  },
});

export const duplicatePub = internalMutation({
  args: { userId: v.id("users"), pubId: v.id("pubs") },
  handler: async (ctx, { userId, pubId }) => {
    assertTestEnv();
    return duplicatePubCore(ctx.db, userId, pubId);
  },
});

export const getFirstTunnelToken = internalQuery({
  args: {},
  handler: async (ctx) => {
    assertTestEnv();
    const tunnel = await ctx.db.query("tunnels").first();
    return tunnel?.token ?? null;
  },
});

export const getUserDataCounts = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    assertTestEnv();

    const user = await ctx.db.get(userId);

    const pubs = await ctx.db
      .query("pubs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let pubFiles = 0;
    let pubAccessTokens = 0;
    for (const pub of pubs) {
      const files = await ctx.db
        .query("pubFiles")
        .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
        .collect();
      pubFiles += files.length;
      const tokens = await ctx.db
        .query("pubAccessTokens")
        .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
        .collect();
      pubAccessTokens += tokens.length;
    }

    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return {
      exists: !!user,
      pubs: pubs.length,
      pubFiles,
      pubAccessTokens,
      apiKeys: apiKeys.length,
      hosts: hosts.length,
      connections: connections.length,
    };
  },
});
