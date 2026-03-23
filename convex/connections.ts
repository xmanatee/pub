import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { v } from "convex/values";
import type { LiveInfo } from "../shared/live-api-core";
import { type LiveModelProfile, resolveLiveModelProfile } from "../shared/live-model-profile";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { HOST_STALENESS_THRESHOLD_MS, listFreshOnlineHosts } from "./presence";
import { hashApiKey } from "./utils";

const MAX_CANDIDATES = 50;

async function getConnectionByActiveSlug(db: GenericDatabaseReader<DataModel>, slug: string) {
  return db
    .query("connections")
    .withIndex("by_active_slug", (q) => q.eq("activeSlug", slug))
    .order("desc")
    .first();
}

async function getModelProfileForUser(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
): Promise<LiveModelProfile> {
  const user = await db.get(userId);
  return resolveLiveModelProfile(user?.liveModelProfile);
}

function connectionConflictsWithRequest(
  conn: { activeSlug?: string; hostId: Id<"hosts"> },
  request: { activeSlug: string; hostId: Id<"hosts"> },
) {
  return conn.activeSlug === request.activeSlug || conn.hostId === request.hostId;
}

function connectionMatchesRequest(
  conn: { browserSessionId?: string; activeSlug?: string; hostId: Id<"hosts"> },
  request: { browserSessionId: string; activeSlug: string; hostId: Id<"hosts"> },
) {
  return (
    conn.activeSlug === request.activeSlug &&
    conn.hostId === request.hostId &&
    conn.browserSessionId === request.browserSessionId
  );
}

function pickTargetHost(
  hosts: Array<{ _id: Id<"hosts">; agentName?: string; lastHeartbeatAt: number }>,
  preferredHostId?: Id<"hosts">,
) {
  if (!preferredHostId) return null;
  return hosts.find((host) => host._id === preferredHostId) ?? null;
}

function mapConnectionInfo(
  conn: {
    activeSlug?: string;
    browserOffer?: string;
    agentAnswer?: string;
    agentCandidates: string[];
    browserCandidates: string[];
    createdAt: number;
  },
  modelProfile: LiveModelProfile,
): LiveInfo {
  return {
    slug: conn.activeSlug ?? "",
    browserOffer: conn.browserOffer,
    agentAnswer: conn.agentAnswer,
    browserCandidates: conn.browserCandidates,
    agentCandidates: conn.agentCandidates,
    createdAt: conn.createdAt,
    modelProfile,
  };
}

export async function deleteConnectionsForSlug(db: GenericDatabaseWriter<DataModel>, slug: string) {
  const conns = await db
    .query("connections")
    .withIndex("by_active_slug", (q) => q.eq("activeSlug", slug))
    .collect();
  for (const conn of conns) {
    await db.delete(conn._id);
  }
}

export const getConnectionBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const conn = await getConnectionByActiveSlug(ctx.db, slug);
    if (!conn || conn.userId !== userId) return null;

    const host = await ctx.db.get(conn.hostId);

    return {
      _id: conn._id,
      activeSlug: conn.activeSlug,
      hostId: conn.hostId,
      agentName: host?.agentName,
      browserOffer: conn.browserOffer,
      agentAnswer: conn.agentAnswer,
      agentCandidates: conn.agentCandidates,
      browserCandidates: conn.browserCandidates,
      browserSessionId: conn.browserSessionId,
      createdAt: conn.createdAt,
    };
  },
});

export const getConnectionForHost = internalQuery({
  args: {
    apiKey: v.optional(v.string()),
    daemonSessionId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    hostId: v.optional(v.id("hosts")),
  },
  handler: async (ctx, { apiKey, daemonSessionId, userId, hostId }) => {
    let resolvedUserId: Id<"users">;
    let resolvedHostId: Id<"hosts"> | undefined = hostId;

    const now = Date.now();

    if (apiKey && daemonSessionId) {
      const keyHash = await hashApiKey(apiKey);
      const key = await ctx.db
        .query("apiKeys")
        .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
        .unique();
      if (!key) throw new Error("Invalid API key");

      const byApiKey = await ctx.db
        .query("hosts")
        .withIndex("by_api_key", (q) => q.eq("apiKeyId", key._id))
        .collect();

      const host = byApiKey.find(
        (entry) =>
          entry.daemonSessionId === daemonSessionId &&
          entry.status === "online" &&
          now - entry.lastHeartbeatAt < HOST_STALENESS_THRESHOLD_MS,
      );
      if (!host) return null;

      resolvedUserId = key.userId;
      resolvedHostId = host._id;
    } else if (userId) {
      resolvedUserId = userId;
    } else {
      throw new Error("Missing authentication for connection query");
    }

    const conns = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", resolvedUserId))
      .order("desc")
      .collect();

    const pending = conns.find(
      (c) => c.hostId === resolvedHostId && c.browserOffer && !c.agentAnswer,
    );
    const active = pending ?? conns.find((c) => c.hostId === resolvedHostId);

    if (!active) return null;

    const modelProfile = await getModelProfileForUser(ctx.db, resolvedUserId);
    return mapConnectionInfo(active, modelProfile);
  },
});

export const getConnectionForAgent = query({
  args: { apiKey: v.string(), daemonSessionId: v.string() },
  handler: async (ctx, { apiKey, daemonSessionId }) => {
    const now = Date.now();
    const keyHash = await hashApiKey(apiKey);
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!key) throw new Error("Invalid API key");

    const byApiKey = await ctx.db
      .query("hosts")
      .withIndex("by_api_key", (q) => q.eq("apiKeyId", key._id))
      .collect();

    const host = byApiKey.find(
      (entry) =>
        entry.daemonSessionId === daemonSessionId &&
        entry.status === "online" &&
        now - entry.lastHeartbeatAt < HOST_STALENESS_THRESHOLD_MS,
    );
    if (!host) return null;

    const conns = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", key.userId))
      .order("desc")
      .collect();

    const pending = conns.find((c) => c.hostId === host._id && c.browserOffer && !c.agentAnswer);
    const active = pending ?? conns.find((c) => c.hostId === host._id);

    if (!active) return null;

    const modelProfile = await getModelProfileForUser(ctx.db, key.userId);
    return mapConnectionInfo(active, modelProfile);
  },
});

export const requestConnection = mutation({
  args: {
    slug: v.string(),
    browserSessionId: v.string(),
    browserOffer: v.string(),
    hostId: v.id("hosts"),
  },
  handler: async (ctx, { slug, browserSessionId, browserOffer, hostId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    const freshOnlineHosts = listFreshOnlineHosts(hosts, now);
    if (freshOnlineHosts.length === 0) {
      throw new Error("Agent offline");
    }
    const targetHost = pickTargetHost(freshOnlineHosts, hostId);
    if (!targetHost) {
      throw new Error("Selected agent unavailable");
    }

    const conflictRequest = { activeSlug: slug, hostId: targetHost._id };
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const request = { ...conflictRequest, browserSessionId };
    let reusableConnId: Id<"connections"> | null = null;
    for (const conn of existing) {
      if (!connectionConflictsWithRequest(conn, conflictRequest)) continue;
      if (reusableConnId === null && connectionMatchesRequest(conn, request)) {
        reusableConnId = conn._id;
        continue;
      }
      await ctx.db.delete(conn._id);
    }

    const connPatch = {
      agentAnswer: undefined as string | undefined,
      agentCandidates: [] as string[],
      browserCandidates: [] as string[],
      browserOffer,
      browserSessionId,
      createdAt: now,
      hostId: targetHost._id,
      activeSlug: slug,
    };

    if (reusableConnId) {
      await ctx.db.patch(reusableConnId, connPatch);
      return { _id: reusableConnId, slug };
    }

    const id = await ctx.db.insert("connections", {
      userId,
      ...connPatch,
    });

    return { _id: id, slug };
  },
});

export const storeBrowserCandidates = mutation({
  args: {
    slug: v.string(),
    sessionId: v.string(),
    candidates: v.array(v.string()),
  },
  handler: async (ctx, { slug, sessionId, candidates }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const conn = await getConnectionByActiveSlug(ctx.db, slug);
    if (!conn || conn.userId !== userId) throw new Error("Connection not found");

    if (conn.browserSessionId && conn.browserSessionId !== sessionId) {
      throw new Error("Session mismatch");
    }

    const merged = [...conn.browserCandidates, ...candidates].slice(0, MAX_CANDIDATES);
    await ctx.db.patch(conn._id, { browserCandidates: merged });
  },
});

export const takeoverConnection = mutation({
  args: { slug: v.string(), sessionId: v.string() },
  handler: async (ctx, { slug, sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const conn = await getConnectionByActiveSlug(ctx.db, slug);
    if (!conn || conn.userId !== userId) throw new Error("Connection not found");

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const freshOnlineHosts = listFreshOnlineHosts(hosts, Date.now());
    if (freshOnlineHosts.length === 0) throw new Error("Agent offline");
    const targetHost = pickTargetHost(freshOnlineHosts, conn.hostId);
    if (!targetHost) throw new Error("Agent offline");

    const now = Date.now();
    await ctx.db.insert("connections", {
      userId: conn.userId,
      hostId: targetHost._id,
      activeSlug: slug,
      agentCandidates: [],
      browserCandidates: [],
      browserSessionId: sessionId,
      createdAt: now,
    });
    await ctx.db.delete(conn._id);
  },
});

export const closeConnectionByUser = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const conn = await getConnectionByActiveSlug(ctx.db, slug);
    if (!conn || conn.userId !== userId) return;
    await ctx.db.delete(conn._id);
  },
});

export const updateActiveSlug = mutation({
  args: {
    connectionId: v.id("connections"),
    activeSlug: v.optional(v.string()),
  },
  handler: async (ctx, { connectionId, activeSlug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const conn = await ctx.db.get(connectionId);
    if (!conn || conn.userId !== userId) throw new Error("Connection not found");

    if (activeSlug) {
      const pub = await ctx.db
        .query("pubs")
        .withIndex("by_slug", (q) => q.eq("slug", activeSlug))
        .unique();
      if (!pub || pub.userId !== userId) throw new Error("Pub not found");
    }

    await ctx.db.patch(connectionId, { activeSlug });
  },
});

export const listActiveConnections = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const conns = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return conns
      .filter((c): c is typeof c & { activeSlug: string } => !!c.activeSlug)
      .map((c) => ({ slug: c.activeSlug }));
  },
});

export const signalConnection = internalMutation({
  args: {
    slug: v.string(),
    userId: v.id("users"),
    apiKeyId: v.id("apiKeys"),
    daemonSessionId: v.string(),
    answer: v.optional(v.string()),
    candidates: v.optional(v.array(v.string())),
    agentName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { slug, userId, apiKeyId, daemonSessionId, answer, candidates, agentName },
  ) => {
    const conn = await getConnectionByActiveSlug(ctx.db, slug);
    if (!conn || conn.userId !== userId) throw new Error("Connection not found");

    const host = await ctx.db.get(conn.hostId);
    if (!host || host.apiKeyId !== apiKeyId || host.daemonSessionId !== daemonSessionId) {
      throw new Error("Connection assigned to another agent");
    }

    const patch: Record<string, unknown> = {};
    if (answer !== undefined) patch.agentAnswer = answer;
    if (agentName !== undefined) {
      await ctx.db.patch(host._id, { agentName });
    }
    if (candidates?.length) {
      const merged = [...conn.agentCandidates, ...candidates].slice(0, MAX_CANDIDATES);
      patch.agentCandidates = merged;
    }

    await ctx.db.patch(conn._id, patch);
  },
});

export const closeConnection = internalMutation({
  args: { slug: v.string(), userId: v.id("users") },
  handler: async (ctx, { slug, userId }) => {
    const conn = await getConnectionByActiveSlug(ctx.db, slug);
    if (!conn || conn.userId !== userId) throw new Error("Connection not found");
    await ctx.db.delete(conn._id);
  },
});

export const getConnectionBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return getConnectionByActiveSlug(ctx.db, slug);
  },
});

export const listConnectionsByUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const conns = await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return conns
      .filter((c): c is typeof c & { activeSlug: string } => !!c.activeSlug)
      .map((c) => ({
        slug: c.activeSlug,
        status: "active" as const,
        createdAt: c.createdAt,
      }));
  },
});
