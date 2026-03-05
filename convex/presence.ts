import type { GenericDatabaseWriter } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";

const STALENESS_THRESHOLD_MS = 90_000;

export const goOnline = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { status: "online", lastHeartbeatAt: now });
      await ctx.scheduler.runAt(now + STALENESS_THRESHOLD_MS, internal.presence.checkStaleness, {
        presenceId: existing._id,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("agentPresence", {
      userId,
      status: "online",
      lastHeartbeatAt: now,
      createdAt: now,
    });

    await ctx.scheduler.runAt(now + STALENESS_THRESHOLD_MS, internal.presence.checkStaleness, {
      presenceId: id,
    });

    return id;
  },
});

export const heartbeat = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const presence = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!presence) throw new Error("Not online");

    const now = Date.now();
    await ctx.db.patch(presence._id, { lastHeartbeatAt: now });
    await ctx.scheduler.runAt(now + STALENESS_THRESHOLD_MS, internal.presence.checkStaleness, {
      presenceId: presence._id,
    });
  },
});

export const goOffline = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const presence = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!presence) return;

    await ctx.db.patch(presence._id, { status: "offline" });

    await deleteActiveLivesForUser(ctx.db, userId);
  },
});

export const checkStaleness = internalMutation({
  args: { presenceId: v.id("agentPresence") },
  handler: async (ctx, { presenceId }) => {
    const presence = await ctx.db.get(presenceId);
    if (!presence || presence.status === "offline") return;

    const elapsed = Date.now() - presence.lastHeartbeatAt;
    if (elapsed >= STALENESS_THRESHOLD_MS) {
      await ctx.db.patch(presenceId, { status: "offline" });
      await deleteActiveLivesForUser(ctx.db, presence.userId);
    }
  },
});

export const isAgentOnline = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub) return false;

    const presence = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", pub.userId))
      .unique();

    return presence?.status === "online";
  },
});

async function deleteActiveLivesForUser(db: GenericDatabaseWriter<DataModel>, userId: Id<"users">) {
  const lives = await db
    .query("lives")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const live of lives) {
    if (live.status === "active") {
      await db.delete(live._id);
    }
  }
}
