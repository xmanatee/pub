import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import { validate as validateInitData } from "@telegram-apps/init-data-node/web";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { telegramNotLinkedError } from "./auth_errors";
import { parseInitDataUser } from "./telegram";

async function validateAgainstRegisteredBots(initData: string, botTokens: string[]): Promise<void> {
  if (botTokens.length === 0) {
    throw new Error("No Telegram bot connected");
  }
  try {
    await Promise.any(botTokens.map((token) => validateInitData(initData, token)));
  } catch {
    throw new Error("Invalid initData signature");
  }
}

const telegram = ConvexCredentials<DataModel>({
  id: "telegram",
  authorize: async (credentials, ctx) => {
    const initData = credentials.initData as string | undefined;
    if (!initData) throw new Error("Missing initData");

    const botTokens = await ctx.runQuery(internal.telegramBots.getAllBotTokens);
    await validateAgainstRegisteredBots(initData, botTokens);

    const user = parseInitDataUser(initData);
    const providerAccountId = String(user.id);

    const existing = await ctx.runQuery(internal.auth_accounts.findByProviderAccount, {
      provider: "telegram",
      providerAccountId,
    });
    if (existing) return { userId: existing.userId };

    if (credentials.createAccount !== true) {
      throw telegramNotLinkedError();
    }

    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    const profile: Record<string, string> = { name };
    if (user.photo_url) profile.image = user.photo_url;

    const { user: newUser } = await createAccount(ctx, {
      provider: "telegram",
      account: { id: providerAccountId },
      profile,
    });
    return { userId: newUser._id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Google, telegram],
});
