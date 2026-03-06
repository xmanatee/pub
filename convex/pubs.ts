import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { PRESENCE_STALENESS_THRESHOLD_MS } from "./presence";
import { CONTENT_TYPE_VALIDATOR, generateSlug, hashApiKey, MAX_PUBS } from "./utils";

/** Max ICE candidates stored per side to bound document size */
const MAX_CANDIDATES = 50;

const LIVE_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function buildPubPatch(fields: {
  content?: string;
  contentType?: "html" | "markdown" | "text";
  title?: string;
  isPublic?: boolean;
  slug?: string;
}) {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (fields.content !== undefined) patch.content = fields.content;
  if (fields.contentType !== undefined) patch.contentType = fields.contentType;
  if (fields.title !== undefined) patch.title = fields.title;
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

async function deleteActiveLivesForSlug(db: GenericDatabaseWriter<DataModel>, slug: string) {
  const lives = await db
    .query("lives")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
  for (const live of lives) {
    await db.delete(live._id);
  }
}

function listFreshOnlinePresences(
  presences: Array<{
    _id: Id<"agentPresence">;
    status: "online" | "offline";
    lastHeartbeatAt: number;
    agentName?: string;
  }>,
  now: number,
) {
  return presences
    .filter(
      (presence) =>
        presence.status === "online" &&
        now - presence.lastHeartbeatAt < PRESENCE_STALENESS_THRESHOLD_MS,
    )
    .sort((a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt);
}

function pickTargetPresence(
  presences: Array<{ _id: Id<"agentPresence">; agentName?: string; lastHeartbeatAt: number }>,
  preferredPresenceId?: Id<"agentPresence">,
) {
  if (preferredPresenceId) {
    return presences.find((presence) => presence._id === preferredPresenceId) ?? null;
  }
  return presences[0] ?? null;
}

function liveMatchesTargetPresence(
  live: { targetPresenceId?: Id<"agentPresence"> },
  targetPresenceId?: Id<"agentPresence">,
) {
  if (!targetPresenceId) return true;
  return live.targetPresenceId === targetPresenceId;
}

function mapPub(
  pub: {
    _id: Id<"pubs">;
    slug: string;
    contentType?: string;
    content?: string;
    title?: string;
    isPublic: boolean;
    expiresAt?: number;
    createdAt: number;
    updatedAt: number;
  },
  includeContent = false,
) {
  const dto: {
    _id: Id<"pubs">;
    slug: string;
    contentType?: string;
    title?: string;
    isPublic: boolean;
    expiresAt?: number;
    createdAt: number;
    updatedAt: number;
    content?: string;
  } = {
    _id: pub._id,
    slug: pub.slug,
    contentType: pub.contentType,
    title: pub.title,
    isPublic: pub.isPublic,
    expiresAt: pub.expiresAt,
    createdAt: pub.createdAt,
    updatedAt: pub.updatedAt,
  };
  if (includeContent) dto.content = pub.content;
  return dto;
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

export const listByUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };

    const result = await ctx.db
      .query("pubs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((p) => ({
        ...mapPub(p),
        contentPreview: (p.content ?? "").slice(0, 2000),
      })),
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
        contentType: p.contentType,
        title: p.title,
        createdAt: p.createdAt,
        contentPreview: p.contentType === "html" ? "" : (p.content ?? "").slice(0, 2000),
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

    return lives
      .filter((s) => s.expiresAt > Date.now())
      .map((s) => ({
        slug: s.slug,
        hasConnection: !!s.agentAnswer,
        expiresAt: s.expiresAt,
      }));
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

    const count = await countUserPubs(ctx.db, userId);
    if (count >= MAX_PUBS) {
      throw new Error(`Pub limit reached (${MAX_PUBS})`);
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
    });

    return { _id: id, slug };
  },
});

export const getLiveBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.expiresAt < Date.now()) return null;
    if (live.userId !== userId) return null;

    return {
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
      expiresAt: live.expiresAt,
    };
  },
});

/**
 * Daemon signaling query.
 *
 * Uses API key authentication (for non-browser agent process) and returns the
 * currently relevant live snapshot:
 * - pending live first (browser offer exists, agent answer missing)
 * - otherwise latest active live.
 */
export const getLiveForAgentByApiKey = query({
  args: { apiKey: v.string(), daemonSessionId: v.string() },
  handler: async (ctx, { apiKey, daemonSessionId }) => {
    const keyHash = await hashApiKey(apiKey);
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!key) throw new Error("Invalid API key");
    const now = Date.now();
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
    const allPresences = await ctx.db
      .query("agentPresence")
      .withIndex("by_user", (q) => q.eq("userId", key.userId))
      .collect();
    const freshOnlinePresences = listFreshOnlinePresences(allPresences, now);
    const matchesCurrentAgent = (live: { targetPresenceId?: Id<"agentPresence"> }) => {
      if (live.targetPresenceId) return live.targetPresenceId === presence._id;
      return freshOnlinePresences.length === 1 && freshOnlinePresences[0]?._id === presence._id;
    };

    const lives = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", key.userId))
      .order("desc")
      .collect();

    const pending = lives.find(
      (s) => s.expiresAt > now && matchesCurrentAgent(s) && s.browserOffer && !s.agentAnswer,
    );
    const active =
      pending ??
      lives.find((s) => {
        return s.expiresAt > now && matchesCurrentAgent(s);
      });
    if (!active) return null;

    return {
      slug: active.slug,
      status: active.status,
      browserOffer: active.browserOffer,
      agentAnswer: active.agentAnswer,
      browserCandidates: active.browserCandidates,
      agentCandidates: active.agentCandidates,
      createdAt: active.createdAt,
      expiresAt: active.expiresAt,
    };
  },
});

export const requestLive = mutation({
  args: {
    slug: v.string(),
    browserSessionId: v.string(),
    browserOffer: v.string(),
    targetPresenceId: v.optional(v.id("agentPresence")),
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
      await ctx.db.delete(live._id);
    }

    const expiresAt = Date.now() + LIVE_EXPIRY_MS;
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
      expiresAt,
    });

    await ctx.scheduler.runAt(expiresAt, internal.pubs.expireLive, { id });
    return { _id: id, slug, expiresAt };
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

    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.expiresAt < Date.now()) throw new Error("Live not found");
    if (live.userId !== userId) throw new Error("Live not found");

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

    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.expiresAt < Date.now()) throw new Error("Live not found");
    if (live.userId !== userId) throw new Error("Live not found");

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

    await ctx.db.patch(live._id, {
      browserSessionId: sessionId,
      targetPresenceId: targetPresence._id,
      agentName: targetPresence.agentName,
      agentAnswer: undefined,
      agentCandidates: [],
      lastTakeoverAt: Date.now(),
    });
  },
});

export const closeLiveByUser = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.userId !== userId) return;
    await ctx.db.delete(live._id);
  },
});

export const createPub = internalMutation({
  args: {
    userId: v.id("users"),
    slug: v.string(),
    contentType: v.optional(CONTENT_TYPE_VALIDATOR),
    content: v.optional(v.string()),
    title: v.optional(v.string()),
    isPublic: v.boolean(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const count = await countUserPubs(ctx.db, args.userId);
    if (count >= MAX_PUBS) {
      throw new Error(`Pub limit reached (${MAX_PUBS})`);
    }

    const id = await ctx.db.insert("pubs", {
      userId: args.userId,
      slug: args.slug,
      contentType: args.contentType,
      content: args.content,
      title: args.title,
      isPublic: args.isPublic,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (args.expiresAt) {
      await ctx.scheduler.runAt(args.expiresAt, internal.pubs.expirePub, { id });
    }

    return id;
  },
});

export const expirePub = internalMutation({
  args: { id: v.id("pubs") },
  handler: async (ctx, { id }) => {
    const pub = await ctx.db.get(id);
    if (!pub) return;

    await deleteActiveLivesForSlug(ctx.db, pub.slug);
    await ctx.db.delete(id);
  },
});

export const updatePub = internalMutation({
  args: {
    id: v.id("pubs"),
    content: v.optional(v.string()),
    contentType: v.optional(CONTENT_TYPE_VALIDATOR),
    title: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, { id, content, contentType, title, isPublic, slug }) => {
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

    const patch = buildPubPatch({ content, contentType, title, isPublic, slug });
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
    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.userId !== userId) throw new Error("Live not found");
    if (live.expiresAt < Date.now()) throw new Error("Live expired");
    const now = Date.now();

    let targetPresenceName: string | undefined;
    if (live.targetPresenceId) {
      const targetPresence = await ctx.db.get(live.targetPresenceId);
      const isAssignedAgent =
        !!targetPresence &&
        targetPresence.apiKeyId === apiKeyId &&
        targetPresence.daemonSessionId === daemonSessionId;
      if (!isAssignedAgent) throw new Error("Live assigned to another agent");
      targetPresenceName = targetPresence.agentName;
    } else {
      const byApiKey = await ctx.db
        .query("agentPresence")
        .withIndex("by_api_key", (q) => q.eq("apiKeyId", apiKeyId))
        .collect();
      const hasMatchingPresence = byApiKey.some(
        (presence) =>
          presence.daemonSessionId === daemonSessionId &&
          presence.status === "online" &&
          now - presence.lastHeartbeatAt < PRESENCE_STALENESS_THRESHOLD_MS,
      );
      if (!hasMatchingPresence) throw new Error("Live assigned to another agent");
    }

    const patch: Record<string, unknown> = {};
    if (answer !== undefined) patch.agentAnswer = answer;
    const resolvedAgentName = targetPresenceName ?? agentName;
    if (resolvedAgentName !== undefined) patch.agentName = resolvedAgentName;
    if (candidates?.length) {
      const merged = [...live.agentCandidates, ...candidates].slice(0, MAX_CANDIDATES);
      patch.agentCandidates = merged;
    }

    await ctx.db.patch(live._id, patch);
  },
});

export const getPendingLiveForAgent = internalQuery({
  args: { userId: v.id("users"), targetPresenceId: v.optional(v.id("agentPresence")) },
  handler: async (ctx, { userId, targetPresenceId }) => {
    const lives = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const pending = lives.find(
      (s) =>
        s.expiresAt > Date.now() &&
        liveMatchesTargetPresence(s, targetPresenceId) &&
        s.browserOffer &&
        !s.agentAnswer,
    );
    if (!pending?.browserOffer) return null;

    return {
      slug: pending.slug,
      browserOffer: pending.browserOffer,
      browserCandidates: pending.browserCandidates,
      createdAt: pending.createdAt,
      expiresAt: pending.expiresAt,
    };
  },
});

export const getActiveLiveForAgent = internalQuery({
  args: { userId: v.id("users"), targetPresenceId: v.optional(v.id("agentPresence")) },
  handler: async (ctx, { userId, targetPresenceId }) => {
    const lives = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const active = lives.find(
      (s) => s.expiresAt > Date.now() && liveMatchesTargetPresence(s, targetPresenceId),
    );
    if (!active) return null;

    return {
      slug: active.slug,
      browserOffer: active.browserOffer,
      agentAnswer: active.agentAnswer,
      browserCandidates: active.browserCandidates,
      agentCandidates: active.agentCandidates,
      createdAt: active.createdAt,
      expiresAt: active.expiresAt,
    };
  },
});

export const closeLive = internalMutation({
  args: { slug: v.string(), userId: v.id("users") },
  handler: async (ctx, { slug, userId }) => {
    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.userId !== userId) throw new Error("Live not found");
    await ctx.db.delete(live._id);
  },
});

export const expireLive = internalMutation({
  args: { id: v.id("lives") },
  handler: async (ctx, { id }) => {
    const live = await ctx.db.get(id);
    if (live) {
      await ctx.db.delete(id);
    }
  },
});

export const getLiveBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.expiresAt < Date.now()) return null;
    return live;
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
    return lives
      .filter((s) => s.expiresAt > Date.now())
      .map((s) => ({
        slug: s.slug,
        status: s.status,
        hasConnection: !!s.agentAnswer,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      }));
  },
});
