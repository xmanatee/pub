import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const HOST_STALENESS_THRESHOLD_MS = 90_000;

function isFreshOnlineHost(
  host: {
    status: "online" | "offline";
    lastHeartbeatAt: number;
  } | null,
  now: number,
): boolean {
  if (!host || host.status !== "online") return false;
  return now - host.lastHeartbeatAt < HOST_STALENESS_THRESHOLD_MS;
}

async function listHostsByApiKey(db: GenericDatabaseReader<DataModel>, apiKeyId: Id<"apiKeys">) {
  return db
    .query("hosts")
    .withIndex("by_api_key", (q) => q.eq("apiKeyId", apiKeyId))
    .collect();
}

export function listFreshOnlineHosts(
  hosts: Array<{
    _id: Id<"hosts">;
    status: "online" | "offline";
    lastHeartbeatAt: number;
    agentName?: string;
  }>,
  now: number,
) {
  return hosts
    .filter((host) => isFreshOnlineHost(host, now))
    .sort((a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt);
}

async function deleteConnectionsForHost(db: GenericDatabaseWriter<DataModel>, hostId: Id<"hosts">) {
  const conns = await db
    .query("connections")
    .withIndex("by_host", (q) => q.eq("hostId", hostId))
    .collect();
  for (const conn of conns) {
    await db.delete(conn._id);
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
    const byApiKey = await listHostsByApiKey(ctx.db, apiKeyId);

    const otherSession = byApiKey.find(
      (h) => h.daemonSessionId !== daemonSessionId && isFreshOnlineHost(h, now),
    );
    if (otherSession) {
      throw new Error("API key already in use");
    }

    const existing = byApiKey.find((h) => h.daemonSessionId === daemonSessionId);

    if (existing) {
      const patch: {
        status: "online";
        lastHeartbeatAt: number;
        updatedAt: number;
        agentName?: string;
      } = { status: "online", lastHeartbeatAt: now, updatedAt: now };
      if (agentName !== undefined) patch.agentName = agentName;
      await ctx.db.patch(existing._id, patch);
      await ctx.scheduler.runAt(
        now + HOST_STALENESS_THRESHOLD_MS,
        internal.presence.checkStaleness,
        { presenceId: existing._id },
      );
      return existing._id;
    }

    const hostId = await ctx.db.insert("hosts", {
      userId,
      apiKeyId,
      agentName,
      daemonSessionId,
      status: "online",
      lastHeartbeatAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAt(now + HOST_STALENESS_THRESHOLD_MS, internal.presence.checkStaleness, {
      presenceId: hostId,
    });

    return hostId;
  },
});

export const heartbeat = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), daemonSessionId: v.string() },
  handler: async (ctx, { apiKeyId, daemonSessionId }) => {
    const byApiKey = await listHostsByApiKey(ctx.db, apiKeyId);
    const host = byApiKey.find(
      (h) => h.daemonSessionId === daemonSessionId && h.status === "online",
    );
    if (!host) throw new Error("Not online");

    const now = Date.now();
    await ctx.db.patch(host._id, { lastHeartbeatAt: now, updatedAt: now });
  },
});

export const goOffline = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), daemonSessionId: v.string() },
  handler: async (ctx, { apiKeyId, daemonSessionId }) => {
    const byApiKey = await listHostsByApiKey(ctx.db, apiKeyId);
    const host = byApiKey.find((h) => h.daemonSessionId === daemonSessionId);
    if (!host) return;

    await ctx.db.patch(host._id, { status: "offline", updatedAt: Date.now() });
    await deleteConnectionsForHost(ctx.db, host._id);
  },
});

export const checkStaleness = internalMutation({
  args: { presenceId: v.id("hosts") },
  handler: async (ctx, { presenceId: hostId }) => {
    const host = await ctx.db.get(hostId);
    if (!host || host.status === "offline") return;

    const now = Date.now();
    const elapsed = now - host.lastHeartbeatAt;
    if (elapsed < HOST_STALENESS_THRESHOLD_MS) {
      await ctx.scheduler.runAt(
        host.lastHeartbeatAt + HOST_STALENESS_THRESHOLD_MS,
        internal.presence.checkStaleness,
        { presenceId: hostId },
      );
      return;
    }

    await ctx.db.patch(hostId, { status: "offline", updatedAt: now });
    await deleteConnectionsForHost(ctx.db, hostId);
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

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", pub.userId))
      .collect();
    return listFreshOnlineHosts(hosts, Date.now()).map((host) => ({
      hostId: host._id,
      agentName: host.agentName ?? "Agent",
    }));
  },
});

export const getOnlineAgentCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return listFreshOnlineHosts(hosts, Date.now()).length;
  },
});

export const getHostByApiKeySession = internalQuery({
  args: { apiKeyId: v.id("apiKeys"), daemonSessionId: v.string() },
  handler: async (ctx, { apiKeyId, daemonSessionId }) => {
    const byApiKey = await listHostsByApiKey(ctx.db, apiKeyId);
    const now = Date.now();
    const host = byApiKey.find(
      (h) => h.daemonSessionId === daemonSessionId && isFreshOnlineHost(h, now),
    );
    if (!host) return null;
    return {
      _id: host._id,
      userId: host.userId,
      apiKeyId: host.apiKeyId,
      agentName: host.agentName,
      lastHeartbeatAt: host.lastHeartbeatAt,
    };
  },
});

export const isCurrentUserAgentOnline = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return listFreshOnlineHosts(hosts, Date.now()).length > 0;
  },
});
