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

export async function validateInitData(
  raw: string,
  botToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash) throw new Error("Missing hash in initData");

  params.delete("hash");
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const encoder = new TextEncoder();

  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretHash = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken));

  const dataKey = await crypto.subtle.importKey(
    "raw",
    secretHash,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", dataKey, encoder.encode(dataCheckString));

  const computedHash = Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  if (computedHash !== hash) throw new Error("Invalid initData signature");

  const authDate = params.get("auth_date");
  if (authDate) {
    const authTimestamp = Number.parseInt(authDate, 10);
    if (Date.now() / 1000 - authTimestamp > expiresInSeconds) {
      throw new Error("initData expired");
    }
  }
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

    return accounts.map((a) => a.provider);
  },
});
