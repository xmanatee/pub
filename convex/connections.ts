import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { v } from "convex/values";
import type { LiveInfo } from "../shared/live-api-core";
import { type LiveModelProfile, resolveLiveModelProfile } from "../shared/live-model-profile";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { isFreshHost, listFreshOnlineHosts } from "./presence";
import { hashApiKey } from "./utils";

const MAX_CANDIDATES = 50;

type ConnectionSnapshot = {
  _id: Id<"connections">;
  activeSlug?: string;
  browserSessionId?: string;
};

type ConnectionRequestResolution =
  | { type: "insert" }
  | { type: "refresh"; connectionId: Id<"connections">; staleConnectionId?: Id<"connections"> };

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

export function resolveConnectionRequest(params: {
  browserSessionId: string;
  hostConnection: ConnectionSnapshot | null;
  slugConnection: ConnectionSnapshot | null;
}): ConnectionRequestResolution {
  const { browserSessionId, hostConnection, slugConnection } = params;

  if (slugConnection) {
    if (slugConnection.browserSessionId && slugConnection.browserSessionId !== browserSessionId) {
      throw new Error("Live session is active on another device. Take over to continue.");
    }

    if (hostConnection && hostConnection._id !== slugConnection._id) {
      return {
        type: "refresh",
        connectionId: hostConnection._id,
        staleConnectionId: slugConnection._id,
      };
    }

    return { type: "refresh", connectionId: slugConnection._id };
  }

  if (hostConnection) {
    return { type: "refresh", connectionId: hostConnection._id };
  }

  return { type: "insert" };
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
      takeoverAt: conn.takeoverAt,
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
    userId: v.id("users"),
    hostId: v.optional(v.id("hosts")),
  },
  handler: async (ctx, { userId, hostId }) => {
    if (!hostId) return null;

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_host", (q) => q.eq("hostId", hostId))
      .first();
    if (!conn || conn.userId !== userId) return null;

    const modelProfile = await getModelProfileForUser(ctx.db, userId);
    return mapConnectionInfo(conn, modelProfile);
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

    const host = await ctx.db
      .query("hosts")
      .withIndex("by_api_key_session", (q) =>
        q.eq("apiKeyId", key._id).eq("daemonSessionId", daemonSessionId),
      )
      .first();
    if (!host || !isFreshHost(host, now)) return null;

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_host", (q) => q.eq("hostId", host._id))
      .first();
    if (!conn) return null;

    const modelProfile = await getModelProfileForUser(ctx.db, key.userId);
    return mapConnectionInfo(conn, modelProfile);
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
    if (freshOnlineHosts.length === 0) throw new Error("Agent offline");

    const targetHost = freshOnlineHosts.find((h) => h._id === hostId);
    if (!targetHost) throw new Error("Selected agent unavailable");

    const slugConn = await getConnectionByActiveSlug(ctx.db, slug);
    const hostConn = await ctx.db
      .query("connections")
      .withIndex("by_host", (q) => q.eq("hostId", targetHost._id))
      .first();

    const resolution = resolveConnectionRequest({
      browserSessionId,
      slugConnection: slugConn,
      hostConnection: hostConn,
    });

    const nextState = {
      userId,
      hostId: targetHost._id,
      activeSlug: slug,
      browserSessionId,
      takeoverAt: undefined,
      browserOffer,
      agentAnswer: undefined,
      agentCandidates: [],
      browserCandidates: [],
      createdAt: now,
    };

    if (resolution.type === "refresh") {
      if (resolution.staleConnectionId) {
        await ctx.db.delete(resolution.staleConnectionId);
      }
      await ctx.db.patch(resolution.connectionId, nextState);
      return { _id: resolution.connectionId, slug };
    }

    const id = await ctx.db.insert("connections", nextState);

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

    const host = await ctx.db.get(conn.hostId);
    if (!host || !isFreshHost(host, Date.now())) throw new Error("Agent offline");

    const takeoverAt = conn.browserSessionId === sessionId ? conn.takeoverAt : Date.now();
    await ctx.db.patch(conn._id, {
      browserSessionId: sessionId,
      takeoverAt,
      browserOffer: undefined,
      agentAnswer: undefined,
      agentCandidates: [],
      browserCandidates: [],
      createdAt: Date.now(),
    });
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
