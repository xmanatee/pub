import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { validate } from "@tma.js/init-data-node/web";
import type { DataModel } from "./_generated/dataModel";
import { parseInitDataUser } from "./telegram";

const telegram = ConvexCredentials<DataModel>({
  id: "telegram",
  authorize: async (credentials, ctx) => {
    const initData = credentials.initData as string | undefined;
    if (!initData) throw new Error("Missing initData");

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");

    await validate(initData, botToken, { expiresIn: 3600 });

    const user = parseInitDataUser(initData);
    const accountId = String(user.id);
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    const profile: Record<string, string> = { name };
    if (user.photo_url) profile.image = user.photo_url;

    try {
      const { user: existingUser } = await retrieveAccount(ctx, {
        provider: "telegram",
        account: { id: accountId },
      });
      return { userId: existingUser._id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isMissingAccount = [
        /account.+not found/i,
        /no account/i,
        /does not exist/i,
        /could not find/i,
      ].some((pattern) => pattern.test(message));
      if (!isMissingAccount) throw error;

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
