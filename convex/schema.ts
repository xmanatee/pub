import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const { users: _authUsersTable, ...otherAuthTables } = authTables;

export default defineSchema({
  ...otherAuthTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    isDeveloper: v.optional(v.boolean()),
    isSubscribed: v.optional(v.boolean()),
    liveModelProfile: v.optional(
      v.union(v.literal("fast"), v.literal("balanced"), v.literal("thorough")),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  apiKeys: defineTable({
    userId: v.id("users"),
    keyHash: v.string(),
    keyPreview: v.string(),
    name: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_key_hash", ["keyHash"])
    .index("by_user", ["userId"]),

  pubs: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    content: v.optional(v.string()),
    previewHtml: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastViewedAt: v.optional(v.number()),
    viewCount: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"])
    .index("by_public", ["isPublic", "createdAt"])
    .index("by_user_lastViewedAt", ["userId", "lastViewedAt"])
    .index("by_user_updatedAt", ["userId", "updatedAt"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_user_viewCount", ["userId", "viewCount"]),

  hosts: defineTable({
    userId: v.id("users"),
    apiKeyId: v.id("apiKeys"),
    agentName: v.optional(v.string()),
    daemonSessionId: v.string(),
    status: v.union(v.literal("online"), v.literal("offline")),
    lastHeartbeatAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_api_key", ["apiKeyId"]),

  connections: defineTable({
    userId: v.id("users"),
    hostId: v.id("hosts"),
    browserSessionId: v.optional(v.string()),
    browserOffer: v.optional(v.string()),
    agentAnswer: v.optional(v.string()),
    agentCandidates: v.array(v.string()),
    browserCandidates: v.array(v.string()),
    activeSlug: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_host", ["hostId"])
    .index("by_active_slug", ["activeSlug"]),

  linkTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  telegramBots: defineTable({
    userId: v.id("users"),
    botToken: v.string(),
    botUsername: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
