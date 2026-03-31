import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const BOT_TOKEN_PATTERN = /^\d+:.+$/;

export const upsertBotToken = internalMutation({
  args: {
    userId: v.id("users"),
    botToken: v.string(),
    botUsername: v.string(),
  },
  handler: async (ctx, { userId, botToken, botUsername }) => {
    if (!BOT_TOKEN_PATTERN.test(botToken)) {
      throw new Error("Invalid bot token format");
    }
    const now = Date.now();

    const existing = await ctx.db
      .query("telegramBots")
      .withIndex("by_user_username", (q) => q.eq("userId", userId).eq("botUsername", botUsername))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { botToken, updatedAt: now });
    } else {
      await ctx.db.insert("telegramBots", {
        userId,
        botToken,
        botUsername,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const getAllBotTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("telegramBots").collect();
    return records.map((r) => r.botToken);
  },
});

export const deleteBotTokenByUsername = internalMutation({
  args: {
    userId: v.id("users"),
    botUsername: v.string(),
  },
  handler: async (ctx, { userId, botUsername }) => {
    const existing = await ctx.db
      .query("telegramBots")
      .withIndex("by_user_username", (q) => q.eq("userId", userId).eq("botUsername", botUsername))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
