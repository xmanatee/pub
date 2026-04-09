import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { generateHexToken } from "./utils";

export const registerTunnel = internalMutation({
  args: { userId: v.id("users"), hostId: v.id("hosts") },
  handler: async (ctx, { userId, hostId }) => {
    const existing = await ctx.db
      .query("tunnels")
      .withIndex("by_host", (q) => q.eq("hostId", hostId))
      .collect();

    for (const tunnel of existing) {
      await ctx.db.delete(tunnel._id);
    }

    const token = generateHexToken(24);
    const id = await ctx.db.insert("tunnels", {
      userId,
      hostId,
      token,
      createdAt: Date.now(),
    });

    return { token, tunnelId: id };
  },
});

export const closeTunnel = internalMutation({
  args: { hostId: v.id("hosts") },
  handler: async (ctx, { hostId }) => {
    const tunnels = await ctx.db
      .query("tunnels")
      .withIndex("by_host", (q) => q.eq("hostId", hostId))
      .collect();

    for (const tunnel of tunnels) {
      await ctx.db.delete(tunnel._id);
    }
  },
});

export const getTunnelByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tunnel = await ctx.db
      .query("tunnels")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!tunnel) return null;

    const host = await ctx.db.get(tunnel.hostId);
    if (!host || host.status !== "online") return null;

    return { userId: tunnel.userId, hostId: tunnel.hostId };
  },
});

export const getActiveTunnelsForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const tunnels = await ctx.db
      .query("tunnels")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const results = [];
    for (const tunnel of tunnels) {
      const host = await ctx.db.get(tunnel.hostId);
      if (!host || host.status !== "online") continue;
      results.push({
        token: tunnel.token,
        hostId: tunnel.hostId,
        agentName: host.agentName,
        createdAt: tunnel.createdAt,
      });
    }
    return results;
  },
});
