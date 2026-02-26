import { ShardedCounter } from "@convex-dev/sharded-counter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";

const viewCounter = new ShardedCounter(components.shardedCounter);

export const recordView = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await viewCounter.add(ctx, slug, 1);
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
