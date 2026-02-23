import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

const ALLOWED_REDIRECT_ORIGINS = new Set(["https://pub.blue", "http://localhost:3000"]);

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/$/, "");
}

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GitHub, Google],
  callbacks: {
    async redirect({ redirectTo }) {
      const siteUrl = process.env.SITE_URL;
      if (!siteUrl) throw new Error("Missing SITE_URL");

      const baseUrl = normalizeSiteUrl(siteUrl);
      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) {
        return `${baseUrl}${redirectTo}`;
      }

      const redirectUrl = new URL(redirectTo);
      if (redirectTo.startsWith(baseUrl)) {
        const afterBase = redirectTo[baseUrl.length];
        if (afterBase === undefined || afterBase === "/" || afterBase === "?") {
          return redirectUrl.toString();
        }
      }

      if (redirectUrl.origin === new URL(baseUrl).origin) {
        return redirectUrl.toString();
      }

      if (ALLOWED_REDIRECT_ORIGINS.has(redirectUrl.origin)) {
        return redirectUrl.toString();
      }

      throw new Error(`Invalid redirectTo origin: ${redirectUrl.origin}`);
    },
  },
});
