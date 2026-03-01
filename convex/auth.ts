import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import { parseInitDataUser } from "./telegram";

const telegram = ConvexCredentials<DataModel>({
  id: "telegram",
  authorize: async (credentials, ctx) => {
    const initData = credentials.initData as string | undefined;
    if (!initData) throw new Error("Missing initData");

    /*
     * Telegram initData validation is intentionally disabled for now.
     *
     * Proper implementation plan (per-user/per-agent bot token):
     * 1) CLI: extend `pubblue configure --set telegram.botToken=<token>` to optionally
     *    upload the token to Pub using the user's API key (new authenticated endpoint).
     * 2) Convex schema: add a table for encrypted Telegram bot credentials, scoped by
     *    `userId` and optional `agentId` (or another stable CLI instance identifier).
     * 3) Convex mutations/actions: add set/revoke/get-active-token helpers; never return
     *    raw token via queries and redact in logs.
     * 4) Telegram sign-in: resolve the owning user/agent token (e.g. from start_param
     *    binding), then validate with `@telegram-apps/init-data-node` before accepting auth:
     *    `import { validate, parse, type InitData } from "@telegram-apps/init-data-node";`
     * 5) Migration: once per-user token resolution exists, re-enable strict validation
     *    and remove this temporary bypass.
     */
    // TODO: Re-enable after token source-of-truth is moved from local CLI config
    // to per-user/per-agent server-side storage.
    // await validate(initData, botToken, { expiresIn: 86400 });

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
