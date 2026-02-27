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

  publications: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    contentType: CONTENT_TYPE_VALIDATOR,
    content: v.string(),
    title: v.optional(v.string()),
    isPublic: v.boolean(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"])
    .index("by_public", ["isPublic", "createdAt"]),

  linkTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  tunnels: defineTable({
    tunnelId: v.string(),
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("closed")),
    agentOffer: v.optional(v.string()),
    browserAnswer: v.optional(v.string()),
    agentCandidates: v.array(v.string()),
    browserCandidates: v.array(v.string()),
    title: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_tunnel_id", ["tunnelId"])
    .index("by_user", ["userId"]),
});
