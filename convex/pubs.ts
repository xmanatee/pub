import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { LiveInfo } from "../shared/live-api-core";
import { type LiveModelProfile, resolveLiveModelProfile } from "../shared/live-model-profile";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { listFreshOnlinePresences, PRESENCE_STALENESS_THRESHOLD_MS } from "./presence";
import { generateSlug, hashApiKey, MAX_PUBS, MAX_PUBS_SUBSCRIBED } from "./utils";

function getPubLimit(user: { isSubscribed?: boolean }): number {
  return user.isSubscribed ? MAX_PUBS_SUBSCRIBED : MAX_PUBS;
}

/** Max ICE candidates stored per side to bound document size */
const MAX_CANDIDATES = 50;

export function buildPubPatch(fields: {
  content?: string;
  title?: string;
  description?: string;
  isPublic?: boolean;
  slug?: string;
}) {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (fields.content !== undefined) {
    patch.content = fields.content;
    patch.previewHtml = undefined;
  }
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.isPublic !== undefined) patch.isPublic = fields.isPublic;
  if (fields.slug !== undefined) patch.slug = fields.slug;
  return patch;
}

async function countUserPubs(db: GenericDatabaseReader<DataModel>, userId: Id<"users">) {
  const pubs = await db
    .query("pubs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return pubs.length;
}

async function getLatestLiveBySlug(db: GenericDatabaseReader<DataModel>, slug: string) {
  return db
    .query("lives")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .order("desc")
    .first();
}

async function getLiveModelProfileForUser(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
): Promise<LiveModelProfile> {
  const user = await db.get(userId);
  return resolveLiveModelProfile(user?.liveModelProfile);
}

export function liveConflictsWithRequest<TPresenceId extends string>(
  live: { slug: string; targetPresenceId?: TPresenceId },
  request: { slug: string; targetPresenceId: TPresenceId },
) {
  return live.slug === request.slug || live.targetPresenceId === request.targetPresenceId;
}

async function deleteActiveLivesForSlug(db: GenericDatabaseWriter<DataModel>, slug: string) {
  const lives = await db
    .query("lives")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
  for (const live of lives) {
    await db.delete(live._id);
  }
}

function pickTargetPresence(
  presences: Array<{ _id: Id<"agentPresence">; agentName?: string; lastHeartbeatAt: number }>,
  preferredPresenceId?: Id<"agentPresence">,
) {
  if (!preferredPresenceId) return null;
  return presences.find((presence) => presence._id === preferredPresenceId) ?? null;
}

function mapPub(
  pub: {
    _id: Id<"pubs">;
    slug: string;
    content?: string;
    previewHtml?: string;
    title?: string;
    description?: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
    lastViewedAt?: number;
    viewCount?: number;
  },
  includeContent = false,
) {
  const dto: {
    _id: Id<"pubs">;
    slug: string;
    previewHtml?: string;
    title?: string;
    description?: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
    lastViewedAt?: number;
    viewCount: number;
    content?: string;
  } = {
    _id: pub._id,
    slug: pub.slug,
    previewHtml: pub.previewHtml,
    title: pub.title,
    description: pub.description,
    isPublic: pub.isPublic,
    createdAt: pub.createdAt,
    updatedAt: pub.updatedAt,
    lastViewedAt: pub.lastViewedAt,
    viewCount: pub.viewCount ?? 0,
  };
  if (includeContent) dto.content = pub.content;
  return dto;
}

function mapAgentLiveInfo(
  live: {
    slug: string;
    status?: string;
    browserOffer?: string;
    agentAnswer?: string;
    agentCandidates: string[];
    browserCandidates: string[];
    createdAt: number;
  },
  modelProfile: LiveModelProfile,
): LiveInfo {
  return {
    slug: live.slug,
    status: live.status,
    browserOffer: live.browserOffer,
    agentAnswer: live.agentAnswer,
    browserCandidates: live.browserCandidates,
    agentCandidates: live.agentCandidates,
    createdAt: live.createdAt,
    modelProfile,
  };
}

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub) return null;

    const userId = await getAuthUserId(ctx);
    const isOwner = !!userId && pub.userId === userId;

    if (!pub.isPublic && !isOwner) return null;

    return { ...mapPub(pub, true), isOwner };
  },
});

export const pubSortKeyValidator = v.union(
  v.literal("lastViewed"),
  v.literal("lastUpdated"),
  v.literal("newest"),
  v.literal("oldest"),
  v.literal("mostViewed"),
);

export const listByUser = query({
  args: {
    sortKey: v.optional(pubSortKeyValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { sortKey = "lastViewed", paginationOpts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };

    const indexedQuery = (() => {
      switch (sortKey) {
        case "lastViewed":
          return ctx.db
            .query("pubs")
            .withIndex("by_user_lastViewedAt", (q) => q.eq("userId", userId));
        case "lastUpdated":
          return ctx.db.query("pubs").withIndex("by_user_updatedAt", (q) => q.eq("userId", userId));
        case "newest":
        case "oldest":
          return ctx.db.query("pubs").withIndex("by_user_createdAt", (q) => q.eq("userId", userId));
        case "mostViewed":
          return ctx.db.query("pubs").withIndex("by_user_viewCount", (q) => q.eq("userId", userId));
      }
    })();

    const order = sortKey === "oldest" ? "asc" : "desc";
    const result = await indexedQuery.order(order).paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((pub) => mapPub(pub, false)),
    };
  },
});

export const listPublic = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("pubs")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((p) => ({
        slug: p.slug,
        previewHtml: p.previewHtml,
        title: p.title,
        description: p.description,
        createdAt: p.createdAt,
      })),
    };
  },
});

export const toggleVisibility = mutation({
  args: { id: v.id("pubs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    await ctx.db.patch(id, { isPublic: !pub.isPublic, updatedAt: Date.now() });
    return { isPublic: !pub.isPublic };
  },
});

export const deleteByUser = mutation({
  args: { id: v.id("pubs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    await deleteActiveLivesForSlug(ctx.db, pub.slug);
    await ctx.db.delete(id);
  },
});

export const listActiveLives = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const lives = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return lives.map((s) => ({ slug: s.slug }));
  },
});

export const createDraftForLive = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const presences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (listFreshOnlinePresences(presences, Date.now()).length === 0) {
      throw new Error("Agent offline");
    }

    const user = await ctx.db.get(userId);
    const limit = getPubLimit(user ?? {});
    const count = await countUserPubs(ctx.db, userId);
    if (count >= limit) {
      throw new Error(`Pub limit reached (${limit})`);
    }

    let slug: string | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateSlug();
      const existing = await ctx.db
        .query("pubs")
        .withIndex("by_slug", (q) => q.eq("slug", candidate))
        .unique();
      if (!existing) {
        slug = candidate;
        break;
      }
    }
    if (!slug) throw new Error("Could not generate unique slug");

    const now = Date.now();
    const id = await ctx.db.insert("pubs", {
      userId,
      slug,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
      viewCount: 0,
    });

    return { _id: id, slug };
  },
});

export const getLiveBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const live = await getLatestLiveBySlug(ctx.db, slug);
    if (!live || live.userId !== userId) return null;

    return {
      _id: live._id,
      slug: live.slug,
      status: live.status,
      targetPresenceId: live.targetPresenceId,
      agentName: live.agentName,
      browserOffer: live.browserOffer,
      agentAnswer: live.agentAnswer,
      agentCandidates: live.agentCandidates,
      browserCandidates: live.browserCandidates,
      browserSessionId: live.browserSessionId,
      lastTakeoverAt: live.lastTakeoverAt,
      createdAt: live.createdAt,
    };
  },
});

/**
 * Consolidated signaling query for agents.
 *
 * Can be called via API key (for reactive daemon signaling) or via userId
 * (for HTTP polling). Returns the most relevant live session:
 * 1. Pending session (offer exists, no answer)
 * 2. Active session
 */
export const getLive = internalQuery({
  args: {
    apiKey: v.optional(v.string()),
    daemonSessionId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    targetPresenceId: v.optional(v.id("agentPresence")),
  },
  handler: async (ctx, { apiKey, daemonSessionId, userId, targetPresenceId }) => {
    let resolvedUserId: Id<"users">;
    let resolvedPresenceId: Id<"agentPresence"> | undefined = targetPresenceId;

    const now = Date.now();

    if (apiKey && daemonSessionId) {
      const keyHash = await hashApiKey(apiKey);
      const key = await ctx.db
        .query("apiKeys")
        .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
        .unique();
      if (!key) throw new Error("Invalid API key");

      const byApiKey = await ctx.db
        .query("agentPresence")
        .withIndex("by_api_key", (q) => q.eq("apiKeyId", key._id))
        .collect();

      const presence = byApiKey.find(
        (entry) =>
          entry.daemonSessionId === daemonSessionId &&
          entry.status === "online" &&
          now - entry.lastHeartbeatAt < PRESENCE_STALENESS_THRESHOLD_MS,
      );
      if (!presence) return null;

      resolvedUserId = key.userId;
      resolvedPresenceId = presence._id;
    } else if (userId) {
      resolvedUserId = userId;
    } else {
      throw new Error("Missing authentication for live snapshot");
    }

    const lives = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", resolvedUserId))
      .order("desc")
      .collect();

    const pending = lives.find(
      (s) => s.targetPresenceId === resolvedPresenceId && s.browserOffer && !s.agentAnswer,
    );
    const active = pending ?? lives.find((s) => s.targetPresenceId === resolvedPresenceId);

    if (!active) return null;

    const modelProfile = await getLiveModelProfileForUser(ctx.db, resolvedUserId);
    return mapAgentLiveInfo(active, modelProfile);
  },
});

export const getLiveForAgent = query({
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
      .query("agentPresence")
      .withIndex("by_api_key", (q) => q.eq("apiKeyId", key._id))
      .collect();

    const presence = byApiKey.find(
      (entry) =>
        entry.daemonSessionId === daemonSessionId &&
        entry.status === "online" &&
        now - entry.lastHeartbeatAt < PRESENCE_STALENESS_THRESHOLD_MS,
    );
    if (!presence) return null;

    const lives = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", key.userId))
      .order("desc")
      .collect();

    const pending = lives.find(
      (s) => s.targetPresenceId === presence._id && s.browserOffer && !s.agentAnswer,
    );
    const active = pending ?? lives.find((s) => s.targetPresenceId === presence._id);

    if (!active) return null;

    const modelProfile = await getLiveModelProfileForUser(ctx.db, key.userId);
    return mapAgentLiveInfo(active, modelProfile);
  },
});

export const requestLive = mutation({
  args: {
    slug: v.string(),
    browserSessionId: v.string(),
    browserOffer: v.string(),
    targetPresenceId: v.id("agentPresence"),
  },
  handler: async (ctx, { slug, browserSessionId, browserOffer, targetPresenceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    const presences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    const freshOnlinePresences = listFreshOnlinePresences(presences, now);
    if (freshOnlinePresences.length === 0) {
      throw new Error("Agent offline");
    }
    const targetPresence = pickTargetPresence(freshOnlinePresences, targetPresenceId);
    if (!targetPresence) {
      throw new Error("Selected agent unavailable");
    }

    const existing = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const live of existing) {
      if (!liveConflictsWithRequest(live, { slug, targetPresenceId: targetPresence._id })) continue;
      await ctx.db.delete(live._id);
    }

    const id = await ctx.db.insert("lives", {
      slug,
      userId,
      status: "active",
      targetPresenceId: targetPresence._id,
      agentName: targetPresence.agentName,
      browserOffer,
      browserSessionId,
      agentCandidates: [],
      browserCandidates: [],
      createdAt: Date.now(),
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

    const live = await getLatestLiveBySlug(ctx.db, slug);
    if (!live || live.userId !== userId) throw new Error("Live not found");

    if (live.browserSessionId && live.browserSessionId !== sessionId) {
      throw new Error("Session mismatch");
    }

    const merged = [...live.browserCandidates, ...candidates].slice(0, MAX_CANDIDATES);
    await ctx.db.patch(live._id, { browserCandidates: merged });
  },
});

const TAKEOVER_COOLDOWN_MS = 20_000;

export const takeoverLive = mutation({
  args: { slug: v.string(), sessionId: v.string() },
  handler: async (ctx, { slug, sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const live = await getLatestLiveBySlug(ctx.db, slug);
    if (!live || live.userId !== userId) throw new Error("Live not found");

    if (live.lastTakeoverAt && Date.now() - live.lastTakeoverAt < TAKEOVER_COOLDOWN_MS) {
      throw new Error("Takeover cooldown active");
    }
    const presences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const freshOnlinePresences = listFreshOnlinePresences(presences, Date.now());
    if (freshOnlinePresences.length === 0) throw new Error("Agent offline");
    const targetPresence = pickTargetPresence(freshOnlinePresences, live.targetPresenceId);
    if (!targetPresence) throw new Error("Agent offline");

    const now = Date.now();
    await ctx.db.insert("lives", {
      slug: live.slug,
      userId: live.userId,
      status: "active",
      targetPresenceId: targetPresence._id,
      agentName: targetPresence.agentName,
      agentCandidates: [],
      browserCandidates: [],
      browserSessionId: sessionId,
      lastTakeoverAt: now,
      createdAt: now,
    });
    await ctx.db.delete(live._id);
  },
});

export const closeLiveByUser = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const live = await getLatestLiveBySlug(ctx.db, slug);
    if (!live || live.userId !== userId) return;
    await ctx.db.delete(live._id);
  },
});

export const savePreviewHtml = mutation({
  args: {
    slug: v.string(),
    previewHtml: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, { slug, previewHtml, updatedAt }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pub = await ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");
    if (pub.updatedAt !== updatedAt) return;

    await ctx.db.patch(pub._id, { previewHtml });
  },
});

export const createPub = internalMutation({
  args: {
    userId: v.id("users"),
    slug: v.string(),
    content: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const limit = getPubLimit(user ?? {});
    const count = await countUserPubs(ctx.db, args.userId);
    if (count >= limit) {
      throw new Error(`Pub limit reached (${limit})`);
    }

    const id = await ctx.db.insert("pubs", {
      userId: args.userId,
      slug: args.slug,
      content: args.content,
      title: args.title,
      description: args.description,
      isPublic: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewCount: 0,
    });

    return id;
  },
});

export const updatePub = internalMutation({
  args: {
    id: v.id("pubs"),
    content: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, { id, content, title, description, isPublic, slug }) => {
    const pub = await ctx.db.get(id);
    if (!pub) throw new Error("Pub not found");

    if (slug !== undefined && slug !== pub.slug) {
      const lives = await ctx.db
        .query("lives")
        .withIndex("by_slug", (q) => q.eq("slug", pub.slug))
        .collect();
      for (const live of lives) {
        if (live.userId === pub.userId) {
          await ctx.db.patch(live._id, { slug });
        }
      }
    }

    const patch = buildPubPatch({ content, title, description, isPublic, slug });
    await ctx.db.patch(id, patch);
  },
});

export const deletePub = internalMutation({
  args: { id: v.id("pubs"), userId: v.id("users") },
  handler: async (ctx, { id, userId }) => {
    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    await deleteActiveLivesForSlug(ctx.db, pub.slug);
    await ctx.db.delete(id);
  },
});

export const getBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return ctx.db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});

export const listByUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, cursor, limit }) => {
    const numItems = Math.min(limit ?? 25, 100);
    const result = await ctx.db
      .query("pubs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate({ cursor: cursor ?? null, numItems });

    return {
      pubs: result.page,
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const listPublicByUserInternal = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const pubs = await ctx.db
      .query("pubs")
      .withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
      .order("desc")
      .collect();

    return pubs.filter((p) => p.isPublic).slice(0, limit ?? 50);
  },
});

export const storeAgentAnswer = internalMutation({
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
    const live = await getLatestLiveBySlug(ctx.db, slug);
    if (!live || live.userId !== userId) throw new Error("Live not found");
    if (!live.targetPresenceId) throw new Error("Live assigned to another agent");

    const targetPresence = await ctx.db.get(live.targetPresenceId);
    const isAssignedAgent =
      !!targetPresence &&
      targetPresence.apiKeyId === apiKeyId &&
      targetPresence.daemonSessionId === daemonSessionId;
    if (!isAssignedAgent) throw new Error("Live assigned to another agent");

    const patch: Record<string, unknown> = {};
    if (answer !== undefined) patch.agentAnswer = answer;
    const resolvedAgentName = targetPresence.agentName ?? agentName;
    if (resolvedAgentName !== undefined) patch.agentName = resolvedAgentName;
    if (candidates?.length) {
      const merged = [...live.agentCandidates, ...candidates].slice(0, MAX_CANDIDATES);
      patch.agentCandidates = merged;
    }

    await ctx.db.patch(live._id, patch);
  },
});

export const closeLive = internalMutation({
  args: { slug: v.string(), userId: v.id("users") },
  handler: async (ctx, { slug, userId }) => {
    const live = await getLatestLiveBySlug(ctx.db, slug);
    if (!live || live.userId !== userId) throw new Error("Live not found");
    await ctx.db.delete(live._id);
  },
});

export const getLiveBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return getLatestLiveBySlug(ctx.db, slug);
  },
});

export const listLivesByUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const lives = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return lives.map((s) => ({
      slug: s.slug,
      status: s.status,
      createdAt: s.createdAt,
    }));
  },
});
