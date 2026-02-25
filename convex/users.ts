import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

export const currentUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return { _id: userId };
  },
});
