import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

const MAX_TUNNELS_PER_USER = 5;
const MAX_CANDIDATES = 50;

// -- Public queries (browser uses these via reactive subscriptions) ----------

export const getByTunnelId = query({
  args: { tunnelId: v.string() },
  handler: async (ctx, { tunnelId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const tunnel = await ctx.db
      .query("tunnels")
      .withIndex("by_tunnel_id", (q) => q.eq("tunnelId", tunnelId))
      .unique();
    if (!tunnel || tunnel.status === "closed") return null;
    if (tunnel.expiresAt < Date.now()) return null;
    if (tunnel.userId !== userId) return null;

    return {
      tunnelId: tunnel.tunnelId,
      status: tunnel.status,
      agentOffer: tunnel.agentOffer,
      browserAnswer: tunnel.browserAnswer,
      agentCandidates: tunnel.agentCandidates,
      browserCandidates: tunnel.browserCandidates,
      createdAt: tunnel.createdAt,
      expiresAt: tunnel.expiresAt,
    };
  },
});

export const listActiveTunnels = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const tunnels = await ctx.db
      .query("tunnels")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return tunnels
      .filter((t) => t.status === "active" && t.expiresAt > Date.now())
      .map((t) => ({
        tunnelId: t.tunnelId,
        hasConnection: !!t.browserAnswer,
        expiresAt: t.expiresAt,
      }));
  },
});

// -- Public mutations (browser writes signaling data) ------------------------

export const storeBrowserSignal = mutation({
  args: {
    tunnelId: v.string(),
    answer: v.optional(v.string()),
    candidates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { tunnelId, answer, candidates }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const tunnel = await ctx.db
      .query("tunnels")
      .withIndex("by_tunnel_id", (q) => q.eq("tunnelId", tunnelId))
      .unique();
    if (!tunnel || tunnel.status === "closed") throw new Error("Tunnel not found");
    if (tunnel.expiresAt < Date.now()) throw new Error("Tunnel expired");
    if (tunnel.userId !== userId) throw new Error("Tunnel not found");

    const patch: Record<string, unknown> = {};
    if (answer !== undefined) patch.browserAnswer = answer;
    if (candidates?.length) {
      const merged = [...tunnel.browserCandidates, ...candidates].slice(0, MAX_CANDIDATES);
      patch.browserCandidates = merged;
    }
    await ctx.db.patch(tunnel._id, patch);
  },
});

// -- Internal functions (called from HTTP actions) ---------------------------

export const createTunnel = internalMutation({
  args: {
    userId: v.id("users"),
    tunnelId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tunnels")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const active = existing.filter((t) => t.status === "active" && t.expiresAt > Date.now());
    if (active.length >= MAX_TUNNELS_PER_USER) {
      throw new Error(`Tunnel limit reached (${MAX_TUNNELS_PER_USER})`);
    }

    const id = await ctx.db.insert("tunnels", {
      tunnelId: args.tunnelId,
      userId: args.userId,
      status: "active",
      agentCandidates: [],
      browserCandidates: [],
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });

    await ctx.scheduler.runAt(args.expiresAt, internal.tunnels.expire, { id });
    return id;
  },
});

export const storeAgentSignal = internalMutation({
  args: {
    tunnelId: v.string(),
    userId: v.id("users"),
    offer: v.optional(v.string()),
    candidates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { tunnelId, userId, offer, candidates }) => {
    const tunnel = await ctx.db
      .query("tunnels")
      .withIndex("by_tunnel_id", (q) => q.eq("tunnelId", tunnelId))
      .unique();
    if (!tunnel || tunnel.userId !== userId) throw new Error("Tunnel not found");
    if (tunnel.status === "closed") throw new Error("Tunnel closed");
    if (tunnel.expiresAt < Date.now()) throw new Error("Tunnel expired");

    const patch: Record<string, unknown> = {};
    const resetSignaling = offer !== undefined;

    if (resetSignaling) {
      patch.agentOffer = offer;
      patch.agentCandidates = [];
      patch.browserCandidates = [];
      patch.browserAnswer = "";
    }

    if (candidates?.length) {
      const base = resetSignaling ? [] : tunnel.agentCandidates;
      const merged = [...base, ...candidates].slice(0, MAX_CANDIDATES);
      patch.agentCandidates = merged;
    }

    await ctx.db.patch(tunnel._id, patch);
  },
});

export const getByTunnelIdInternal = internalQuery({
  args: { tunnelId: v.string() },
  handler: async (ctx, { tunnelId }) => {
    return ctx.db
      .query("tunnels")
      .withIndex("by_tunnel_id", (q) => q.eq("tunnelId", tunnelId))
      .unique();
  },
});

export const listByUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const tunnels = await ctx.db
      .query("tunnels")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return tunnels
      .filter((t) => t.status === "active" && t.expiresAt > Date.now())
      .map((t) => ({
        tunnelId: t.tunnelId,
        status: t.status,
        hasConnection: !!t.browserAnswer,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
      }));
  },
});

export const closeTunnel = internalMutation({
  args: { tunnelId: v.string(), userId: v.id("users") },
  handler: async (ctx, { tunnelId, userId }) => {
    const tunnel = await ctx.db
      .query("tunnels")
      .withIndex("by_tunnel_id", (q) => q.eq("tunnelId", tunnelId))
      .unique();
    if (!tunnel || tunnel.userId !== userId) throw new Error("Tunnel not found");
    await ctx.db.patch(tunnel._id, { status: "closed" as const });
  },
});

export const expire = internalMutation({
  args: { id: v.id("tunnels") },
  handler: async (ctx, { id }) => {
    const tunnel = await ctx.db.get(id);
    if (tunnel && tunnel.status === "active") {
      await ctx.db.patch(id, { status: "closed" as const });
    }
  },
});
