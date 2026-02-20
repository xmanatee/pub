import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  apiKeys: defineTable({
    userId: v.id("users"),
    key: v.string(),
    name: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_user", ["userId"]),

  publications: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    filename: v.string(),
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
