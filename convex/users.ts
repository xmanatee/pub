import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { resolveLiveModelProfile } from "../shared/live-model-profile";
import { mutation, query } from "./_generated/server";

const liveModelProfileValidator = v.union(
  v.literal("fast"),
  v.literal("balanced"),
  v.literal("thorough"),
);

export const currentUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return {
      _id: userId,
      liveModelProfile: resolveLiveModelProfile(user?.liveModelProfile),
    };
  },
});

export const isDeveloper = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    return user?.isDeveloper === true;
  },
});

export const setLiveModelProfile = mutation({
  args: { liveModelProfile: liveModelProfileValidator },
  handler: async (ctx, { liveModelProfile }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.db.patch(userId, { liveModelProfile });
    return { liveModelProfile };
  },
});
