import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  apiKeys: defineTable({
    userId: v.id("users"),
    // New records store only a one-way hash of the API key.
    keyHash: v.optional(v.string()),
    keyPreview: v.optional(v.string()),
    // Legacy plaintext key retained only for backward compatibility.
    key: v.optional(v.string()),
    name: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_key_hash", ["keyHash"])
    .index("by_key", ["key"])
    .index("by_user", ["userId"]),

  publications: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    contentType: v.union(
      v.literal("html"),
      v.literal("css"),
      v.literal("js"),
      v.literal("markdown"),
      v.literal("text"),
    ),
    content: v.string(),
    title: v.optional(v.string()),
    isPublic: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"]),
});
