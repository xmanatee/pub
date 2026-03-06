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
    const botId = botToken.split(":")[0];
    const now = Date.now();

    const existing = await ctx.db
      .query("telegramBots")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { botId, botToken, botUsername, updatedAt: now });
    } else {
      await ctx.db.insert("telegramBots", {
        userId,
        botId,
        botToken,
        botUsername,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const getBotTokenByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const record = await ctx.db
      .query("telegramBots")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return record?.botToken ?? null;
  },
});

export const deleteBotToken = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("telegramBots")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
