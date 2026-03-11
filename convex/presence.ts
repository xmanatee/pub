import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const PRESENCE_STALENESS_THRESHOLD_MS = 90_000;

function isFreshOnlinePresence(
  presence: {
    status: "online" | "offline";
    lastHeartbeatAt: number;
  } | null,
  now: number,
): boolean {
  if (!presence || presence.status !== "online") return false;
  return now - presence.lastHeartbeatAt < PRESENCE_STALENESS_THRESHOLD_MS;
}

async function listPresencesByApiKey(
  db: GenericDatabaseReader<DataModel>,
  apiKeyId: Id<"apiKeys">,
) {
  return db
    .query("agentPresence")
    .withIndex("by_api_key", (q) => q.eq("apiKeyId", apiKeyId))
    .collect();
}

export function listFreshOnlinePresences(
  presences: Array<{
    _id: Id<"agentPresence">;
    status: "online" | "offline";
    lastHeartbeatAt: number;
    agentName?: string;
  }>,
  now: number,
) {
  return presences
    .filter((presence) => isFreshOnlinePresence(presence, now))
    .sort((a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt);
}

async function deleteLivesForPresence(
  db: GenericDatabaseWriter<DataModel>,
  userId: Id<"users">,
  presenceId: Id<"agentPresence">,
) {
  const lives = await db
    .query("lives")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const live of lives) {
    if (live.targetPresenceId !== presenceId) continue;
    await db.delete(live._id);
  }
}

export const goOnline = internalMutation({
  args: {
    userId: v.id("users"),
    apiKeyId: v.id("apiKeys"),
    daemonSessionId: v.string(),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, { userId, apiKeyId, daemonSessionId, agentName }) => {
    const now = Date.now();
    const byApiKey = await listPresencesByApiKey(ctx.db, apiKeyId);

    const existingOtherSession = byApiKey.find(
      (presence) =>
        presence.daemonSessionId !== daemonSessionId && isFreshOnlinePresence(presence, now),
    );
    if (existingOtherSession) {
      throw new Error("API key already in use");
    }

    const existingForSession = byApiKey.find(
      (presence) => presence.daemonSessionId === daemonSessionId,
    );

    if (existingForSession) {
      const patch: {
        status: "online";
        lastHeartbeatAt: number;
        updatedAt: number;
        agentName?: string;
      } = {
        status: "online",
        lastHeartbeatAt: now,
        updatedAt: now,
      };
      if (agentName !== undefined) {
        patch.agentName = agentName;
      }
      await ctx.db.patch(existingForSession._id, patch);
      await ctx.scheduler.runAt(
        now + PRESENCE_STALENESS_THRESHOLD_MS,
        internal.presence.checkStaleness,
        {
          presenceId: existingForSession._id,
        },
      );
      return existingForSession._id;
    }

    const id = await ctx.db.insert("agentPresence", {
      userId,
      apiKeyId,
      agentName,
      daemonSessionId,
      status: "online",
      lastHeartbeatAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAt(
      now + PRESENCE_STALENESS_THRESHOLD_MS,
      internal.presence.checkStaleness,
      {
        presenceId: id,
      },
    );

    return id;
  },
});

export const heartbeat = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), daemonSessionId: v.string() },
  handler: async (ctx, { apiKeyId, daemonSessionId }) => {
    const byApiKey = await listPresencesByApiKey(ctx.db, apiKeyId);
    const presence = byApiKey.find(
      (candidate) => candidate.daemonSessionId === daemonSessionId && candidate.status === "online",
    );
    if (!presence) throw new Error("Not online");

    const now = Date.now();
    await ctx.db.patch(presence._id, { lastHeartbeatAt: now, updatedAt: now });
  },
});

export const goOffline = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), daemonSessionId: v.string() },
  handler: async (ctx, { apiKeyId, daemonSessionId }) => {
    const byApiKey = await listPresencesByApiKey(ctx.db, apiKeyId);
    const presence = byApiKey.find((candidate) => candidate.daemonSessionId === daemonSessionId);
    if (!presence) return;

    const now = Date.now();
    await ctx.db.patch(presence._id, { status: "offline", updatedAt: now });
    await deleteLivesForPresence(ctx.db, presence.userId, presence._id);
  },
});

export const checkStaleness = internalMutation({
  args: { presenceId: v.id("agentPresence") },
  handler: async (ctx, { presenceId }) => {
    const presence = await ctx.db.get(presenceId);
    if (!presence || presence.status === "offline") return;

    const now = Date.now();
    const elapsed = now - presence.lastHeartbeatAt;
    if (elapsed < PRESENCE_STALENESS_THRESHOLD_MS) {
      await ctx.scheduler.runAt(
        presence.lastHeartbeatAt + PRESENCE_STALENESS_THRESHOLD_MS,
        internal.presence.checkStaleness,
        { presenceId },
      );
      return;
    }

    await ctx.db.patch(presenceId, { status: "offline", updatedAt: now });
    await deleteLivesForPresence(ctx.db, presence.userId, presenceId);
  },
});

export const listAvailableForSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub || pub.userId !== userId) return [];

    const presences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", pub.userId))
      .collect();
    const fresh = listFreshOnlinePresences(presences, Date.now());
    return fresh.map((presence) => ({
      presenceId: presence._id,
      agentName: presence.agentName ?? "Agent",
    }));
  },
});

export const getOnlineAgentCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const presences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return listFreshOnlinePresences(presences, Date.now()).length;
  },
});

export const getPresenceByApiKeySession = internalQuery({
  args: { apiKeyId: v.id("apiKeys"), daemonSessionId: v.string() },
  handler: async (ctx, { apiKeyId, daemonSessionId }) => {
    const byApiKey = await listPresencesByApiKey(ctx.db, apiKeyId);
    const now = Date.now();
    const presence = byApiKey.find(
      (entry) => entry.daemonSessionId === daemonSessionId && isFreshOnlinePresence(entry, now),
    );
    if (!presence) return null;
    return {
      _id: presence._id,
      userId: presence.userId,
      apiKeyId: presence.apiKeyId,
      agentName: presence.agentName,
      lastHeartbeatAt: presence.lastHeartbeatAt,
    };
  },
});

export const isCurrentUserAgentOnline = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const presences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return listFreshOnlinePresences(presences, Date.now()).length > 0;
  },
});
