import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { CONTENT_TYPE_VALIDATOR } from "./utils";

export default defineSchema({
  ...authTables,

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
    contentType: v.optional(CONTENT_TYPE_VALIDATOR),
    content: v.optional(v.string()),
    title: v.optional(v.string()),
    isPublic: v.boolean(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"])
    .index("by_public", ["isPublic", "createdAt"]),

  lives: defineTable({
    slug: v.string(),
    userId: v.id("users"),
    status: v.literal("active"),
    targetPresenceId: v.optional(v.id("agentPresence")),
    agentName: v.optional(v.string()),
    browserOffer: v.optional(v.string()),
    agentAnswer: v.optional(v.string()),
    agentCandidates: v.array(v.string()),
    browserCandidates: v.array(v.string()),
    browserSessionId: v.optional(v.string()),
    lastTakeoverAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"]),

  agentPresence: defineTable({
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

  linkTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  telegramBots: defineTable({
    userId: v.id("users"),
    botId: v.string(),
    botToken: v.string(),
    botUsername: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_bot_id", ["botId"]),
});
