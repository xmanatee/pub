import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export function parseInitDataUser(raw: string): TelegramUser {
  const params = new URLSearchParams(raw);
  const userJson = params.get("user");
  if (!userJson) throw new Error("Missing user in initData");

  const user = JSON.parse(userJson) as TelegramUser;
  if (!user.id || !user.first_name) throw new Error("Invalid user in initData");
  return user;
}

export const getLinkedProviders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();

    const user = await ctx.db.get(userId);

    return accounts.map((a) => ({
      provider: a.provider,
      identifier:
        ((a as Record<string, unknown>).emailVerified as string | undefined) ?? user?.name,
    }));
  },
});
