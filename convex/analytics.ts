import { ShardedCounter } from "@convex-dev/sharded-counter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

const viewCounter = new ShardedCounter(components.shardedCounter);

export const recordView = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await viewCounter.add(ctx, slug, 1);
    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (pub) {
      await ctx.db.patch(pub._id, { lastViewedAt: Date.now() });
    }
  },
});

export const recordPublicView = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub || !pub.isPublic) return { recorded: false };
    await viewCounter.add(ctx, slug, 1);
    await ctx.db.patch(pub._id, { lastViewedAt: Date.now() });
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
