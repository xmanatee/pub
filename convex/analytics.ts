import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

export const recordView = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub) return;
    await ctx.db.patch(pub._id, {
      lastViewedAt: Date.now(),
      viewCount: (pub.viewCount ?? 0) + 1,
    });
  },
});

export const recordPubView = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub) return { recorded: false };
    if (!pub.isPublic) {
      const userId = await getAuthUserId(ctx);
      if (pub.userId !== userId) return { recorded: false };
    }
    await ctx.db.patch(pub._id, {
      lastViewedAt: Date.now(),
      viewCount: (pub.viewCount ?? 0) + 1,
    });
    return { recorded: true };
  },
});
