import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { validate as validateInitData } from "@telegram-apps/init-data-node/web";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { parseInitDataUser } from "./telegram";

const MISSING_ACCOUNT_PATTERNS = [
  /account.+not found/i,
  /no account/i,
  /does not exist/i,
  /could not find/i,
];

function isMissingAccountError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return MISSING_ACCOUNT_PATTERNS.some((p) => p.test(message));
}

async function validateAgainstRegisteredBots(initData: string, botTokens: string[]): Promise<void> {
  if (botTokens.length === 0) {
    throw new Error("No Telegram bot connected");
  }
  for (const token of botTokens) {
    try {
      await validateInitData(initData, token);
      return;
    } catch {}
  }
  throw new Error("Invalid initData signature");
}

const telegram = ConvexCredentials<DataModel>({
  id: "telegram",
  authorize: async (credentials, ctx) => {
    const initData = credentials.initData as string | undefined;
    if (!initData) throw new Error("Missing initData");

    const botTokens = await ctx.runQuery(internal.telegramBots.getAllBotTokens);
    await validateAgainstRegisteredBots(initData, botTokens);

    const user = parseInitDataUser(initData);
    const accountId = String(user.id);

    try {
      const { user: existingUser } = await retrieveAccount(ctx, {
        provider: "telegram",
        account: { id: accountId },
      });
      return { userId: existingUser._id };
    } catch (error) {
      if (!isMissingAccountError(error)) throw error;

      const shouldCreate = credentials.createAccount === "true";
      if (!shouldCreate) {
        throw new Error("TELEGRAM_ACCOUNT_NOT_LINKED");
      }

      const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
      const profile: Record<string, string> = { name };
      if (user.photo_url) profile.image = user.photo_url;

      const { user: newUser } = await createAccount(ctx, {
        provider: "telegram",
        account: { id: accountId },
        profile,
      });
      return { userId: newUser._id };
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Google, telegram],
});
