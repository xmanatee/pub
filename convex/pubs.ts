import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { CONTENT_TYPE_VALIDATOR, MAX_PUBS } from "./utils";

const MAX_LIVES_PER_USER = 1;
const MAX_CANDIDATES = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function closeActiveLivesForSlug(db: GenericDatabaseWriter<DataModel>, slug: string) {
  const lives = await db
    .query("lives")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
  for (const live of lives) {
    if (live.status === "active") {
      await db.patch(live._id, { status: "closed" as const });
    }
  }
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

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

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
      page: result.page.map((p) => mapPub(p)),
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

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

export const toggleVisibility = mutation({
  args: { id: v.id("pubs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Not found");

    await ctx.db.patch(id, { isPublic: !pub.isPublic, updatedAt: Date.now() });
    return { isPublic: !pub.isPublic };
  },
});

export const deleteByUser = mutation({
  args: { id: v.id("pubs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Not found");

    await closeActiveLivesForSlug(ctx.db, pub.slug);
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Live queries (browser uses these via reactive subscriptions)
// ---------------------------------------------------------------------------

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
      .filter((s) => s.status === "active" && s.expiresAt > Date.now())
      .map((s) => ({
        slug: s.slug,
        hasConnection: !!s.browserAnswer,
        expiresAt: s.expiresAt,
      }));
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
    if (!live || live.status === "closed") return null;
    if (live.expiresAt < Date.now()) return null;
    if (live.userId !== userId) return null;

    return {
      slug: live.slug,
      status: live.status,
      agentName: live.agentName,
      agentOffer: live.agentOffer,
      browserAnswer: live.browserAnswer,
      agentCandidates: live.agentCandidates,
      browserCandidates: live.browserCandidates,
      browserSessionId: live.browserSessionId,
      lastTakeoverAt: live.lastTakeoverAt,
      createdAt: live.createdAt,
      expiresAt: live.expiresAt,
    };
  },
});

// ---------------------------------------------------------------------------
// Live mutations (browser writes signaling data)
// ---------------------------------------------------------------------------

export const storeBrowserSignal = mutation({
  args: {
    slug: v.string(),
    sessionId: v.string(),
    answer: v.optional(v.string()),
    candidates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { slug, sessionId, answer, candidates }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.status === "closed") throw new Error("Live not found");
    if (live.expiresAt < Date.now()) throw new Error("Live expired");
    if (live.userId !== userId) throw new Error("Live not found");

    if (live.browserSessionId && live.browserSessionId !== sessionId) {
      throw new Error("Session mismatch");
    }

    const patch: Record<string, unknown> = {};
    if (!live.browserSessionId) patch.browserSessionId = sessionId;
    if (answer !== undefined) patch.browserAnswer = answer;
    if (candidates?.length) {
      const merged = [...live.browserCandidates, ...candidates].slice(0, MAX_CANDIDATES);
      patch.browserCandidates = merged;
    }
    await ctx.db.patch(live._id, patch);
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
    if (!live || live.status === "closed") throw new Error("Live not found");
    if (live.expiresAt < Date.now()) throw new Error("Live expired");
    if (live.userId !== userId) throw new Error("Live not found");

    if (live.lastTakeoverAt && Date.now() - live.lastTakeoverAt < TAKEOVER_COOLDOWN_MS) {
      throw new Error("Takeover cooldown active");
    }

    await ctx.db.patch(live._id, {
      browserSessionId: sessionId,
      browserAnswer: "",
      browserCandidates: [],
      lastTakeoverAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Internal mutations (called from HTTP actions)
// ---------------------------------------------------------------------------

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

    await closeActiveLivesForSlug(ctx.db, pub.slug);
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
    if (!pub) throw new Error("Not found");

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
    if (!pub || pub.userId !== userId) throw new Error("Not found");

    await closeActiveLivesForSlug(ctx.db, pub.slug);
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

// ---------------------------------------------------------------------------
// Internal live mutations (called from HTTP actions)
// ---------------------------------------------------------------------------

export const openLive = internalMutation({
  args: {
    userId: v.id("users"),
    slug: v.string(),
    agentName: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lives")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const active = existing.filter((s) => s.status === "active" && s.expiresAt > Date.now());

    for (const live of active) {
      if (live.slug === args.slug) {
        await ctx.db.patch(live._id, { status: "closed" as const });
      }
    }
    if (active.some((s) => s.slug !== args.slug)) {
      throw new Error(`Live limit reached (${MAX_LIVES_PER_USER})`);
    }

    const id = await ctx.db.insert("lives", {
      slug: args.slug,
      userId: args.userId,
      status: "active",
      agentName: args.agentName,
      agentCandidates: [],
      browserCandidates: [],
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });

    await ctx.scheduler.runAt(args.expiresAt, internal.pubs.expireLive, { id });
    return id;
  },
});

export const storeAgentSignal = internalMutation({
  args: {
    slug: v.string(),
    userId: v.id("users"),
    offer: v.optional(v.string()),
    candidates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { slug, userId, offer, candidates }) => {
    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.userId !== userId) throw new Error("Live not found");
    if (live.status === "closed") throw new Error("Live closed");
    if (live.expiresAt < Date.now()) throw new Error("Live expired");

    const patch: Record<string, unknown> = {};
    const resetSignaling = offer !== undefined;

    if (resetSignaling) {
      patch.agentOffer = offer;
      patch.agentCandidates = [];
      patch.browserCandidates = [];
      patch.browserAnswer = "";
    }

    if (candidates?.length) {
      const base = resetSignaling ? [] : live.agentCandidates;
      const merged = [...base, ...candidates].slice(0, MAX_CANDIDATES);
      patch.agentCandidates = merged;
    }

    await ctx.db.patch(live._id, patch);
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
    await ctx.db.patch(live._id, { status: "closed" as const });
  },
});

export const expireLive = internalMutation({
  args: { id: v.id("lives") },
  handler: async (ctx, { id }) => {
    const live = await ctx.db.get(id);
    if (live && live.status === "active") {
      await ctx.db.patch(id, { status: "closed" as const });
    }
  },
});

// Internal queries for lives

export const getLiveBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const live = await ctx.db
      .query("lives")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!live || live.status === "closed" || live.expiresAt < Date.now()) return null;
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
      .filter((s) => s.status === "active" && s.expiresAt > Date.now())
      .map((s) => ({
        slug: s.slug,
        status: s.status,
        hasConnection: !!s.browserAnswer,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      }));
  },
});
