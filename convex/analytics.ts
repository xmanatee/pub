import { ShardedCounter } from "@convex-dev/sharded-counter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

const viewCounter = new ShardedCounter(components.shardedCounter);

export const recordView = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await viewCounter.add(ctx, slug, 1);
  },
});

export const recordPublicView = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query("publications")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub || !pub.isPublic) return { recorded: false };
    await viewCounter.add(ctx, slug, 1);
    return { recorded: true };
  },
});

export const getViewCount = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return viewCounter.count(ctx, slug);
  },
});

export const getViewCounts = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    const counts: Record<string, number> = {};
    for (const slug of slugs) {
      counts[slug] = await viewCounter.count(ctx, slug);
    }
    return counts;
  },
});
