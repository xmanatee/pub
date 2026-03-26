import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const HOST_STALENESS_THRESHOLD_MS = 90_000;

export function isFreshHost(host: { lastHeartbeatAt: number }, now: number): boolean {
  return now - host.lastHeartbeatAt < HOST_STALENESS_THRESHOLD_MS;
}

async function findHostBySession(
  db: GenericDatabaseReader<DataModel>,
  apiKeyId: Id<"apiKeys">,
  daemonSessionId: string,
) {
  return db
    .query("hosts")
    .withIndex("by_api_key_session", (q) =>
      q.eq("apiKeyId", apiKeyId).eq("daemonSessionId", daemonSessionId),
    )
    .first();
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
    .filter((host) => host.status === "online" && isFreshHost(host, now))
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

async function removeHost(db: GenericDatabaseWriter<DataModel>, hostId: Id<"hosts">) {
  await deleteConnectionsForHost(db, hostId);
  await db.delete(hostId);
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

    // Scan all hosts for this key to detect conflicts and clean up stale entries
    const byApiKey = await ctx.db
      .query("hosts")
      .withIndex("by_api_key", (q) => q.eq("apiKeyId", apiKeyId))
      .collect();

    for (const host of byApiKey) {
      if (host.daemonSessionId === daemonSessionId) continue;
      if (host.status === "online" && isFreshHost(host, now)) {
        throw new Error("API key already in use");
      }
      await removeHost(ctx.db, host._id);
    }

    const existing = await findHostBySession(ctx.db, apiKeyId, daemonSessionId);

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
    const host = await findHostBySession(ctx.db, apiKeyId, daemonSessionId);
    if (!host || host.status !== "online") throw new Error("Not online");

    const now = Date.now();
    await ctx.db.patch(host._id, { lastHeartbeatAt: now, updatedAt: now });
  },
});

export const goOffline = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), daemonSessionId: v.string() },
  handler: async (ctx, { apiKeyId, daemonSessionId }) => {
    const host = await findHostBySession(ctx.db, apiKeyId, daemonSessionId);
    if (!host) return;
    await removeHost(ctx.db, host._id);
  },
});

export const checkStaleness = internalMutation({
  args: { presenceId: v.id("hosts") },
  handler: async (ctx, { presenceId: hostId }) => {
    const host = await ctx.db.get(hostId);
    if (!host) return;

    const now = Date.now();
    if (isFreshHost(host, now)) {
      await ctx.scheduler.runAt(
        host.lastHeartbeatAt + HOST_STALENESS_THRESHOLD_MS,
        internal.presence.checkStaleness,
        { presenceId: hostId },
      );
      return;
    }

    await removeHost(ctx.db, hostId);
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
    const host = await findHostBySession(ctx.db, apiKeyId, daemonSessionId);
    if (!host || host.status !== "online" || !isFreshHost(host, Date.now())) return null;
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
