import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { CONTENT_TYPE_VALIDATOR, MAX_PRIVATE_PUBS, MAX_PUBLIC_PUBS } from "./utils";

const MAX_SESSIONS_PER_USER = 5;
const MAX_CANDIDATES = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isVisibilityEscalation(
  currentIsPublic: boolean,
  nextIsPublic: boolean | undefined,
): boolean {
  return currentIsPublic === false && nextIsPublic === true;
}

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
  return {
    publicCount: pubs.filter((p) => p.isPublic).length,
    privateCount: pubs.filter((p) => !p.isPublic).length,
  };
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

    if (!pub.isPublic) {
      const userId = await getAuthUserId(ctx);
      if (!userId || pub.userId !== userId) return null;
    }

    return mapPub(pub, true);
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

    if (!pub.isPublic) {
      const { publicCount } = await countUserPubs(ctx.db, userId);
      if (publicCount >= MAX_PUBLIC_PUBS) {
        throw new Error(`Public pub limit reached (${MAX_PUBLIC_PUBS})`);
      }
    }

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

    // Close any active sessions for this pub
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", pub.slug))
      .collect();
    for (const session of sessions) {
      if (session.status === "active") {
        await ctx.db.patch(session._id, { status: "closed" as const });
      }
    }

    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Session queries (browser uses these via reactive subscriptions)
// ---------------------------------------------------------------------------

export const listActiveSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return sessions
      .filter((s) => s.status === "active" && s.expiresAt > Date.now())
      .map((s) => ({
        slug: s.slug,
        hasConnection: !!s.browserAnswer,
        expiresAt: s.expiresAt,
      }));
  },
});

export const getSessionBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!session || session.status === "closed") return null;
    if (session.expiresAt < Date.now()) return null;
    if (session.userId !== userId) return null;

    return {
      slug: session.slug,
      status: session.status,
      agentOffer: session.agentOffer,
      browserAnswer: session.browserAnswer,
      agentCandidates: session.agentCandidates,
      browserCandidates: session.browserCandidates,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  },
});

// ---------------------------------------------------------------------------
// Session mutations (browser writes signaling data)
// ---------------------------------------------------------------------------

export const storeBrowserSignal = mutation({
  args: {
    slug: v.string(),
    answer: v.optional(v.string()),
    candidates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { slug, answer, candidates }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!session || session.status === "closed") throw new Error("Session not found");
    if (session.expiresAt < Date.now()) throw new Error("Session expired");
    if (session.userId !== userId) throw new Error("Session not found");

    const patch: Record<string, unknown> = {};
    if (answer !== undefined) patch.browserAnswer = answer;
    if (candidates?.length) {
      const merged = [...session.browserCandidates, ...candidates].slice(0, MAX_CANDIDATES);
      patch.browserCandidates = merged;
    }
    await ctx.db.patch(session._id, patch);
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
    const { publicCount, privateCount } = await countUserPubs(ctx.db, args.userId);

    if (args.isPublic && publicCount >= MAX_PUBLIC_PUBS) {
      throw new Error(`Public pub limit reached (${MAX_PUBLIC_PUBS})`);
    }
    if (!args.isPublic && privateCount >= MAX_PRIVATE_PUBS) {
      throw new Error(`Private pub limit reached (${MAX_PRIVATE_PUBS})`);
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

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", pub.slug))
      .collect();
    for (const session of sessions) {
      if (session.status === "active") {
        await ctx.db.patch(session._id, { status: "closed" as const });
      }
    }

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

    if (isVisibilityEscalation(pub.isPublic, isPublic)) {
      const { publicCount } = await countUserPubs(ctx.db, pub.userId);
      if (publicCount >= MAX_PUBLIC_PUBS) {
        throw new Error(`Public pub limit reached (${MAX_PUBLIC_PUBS})`);
      }
    }

    if (slug !== undefined && slug !== pub.slug) {
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_slug", (q) => q.eq("slug", pub.slug))
        .collect();
      for (const session of sessions) {
        if (session.userId === pub.userId) {
          await ctx.db.patch(session._id, { slug });
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

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", pub.slug))
      .collect();
    for (const session of sessions) {
      if (session.status === "active") {
        await ctx.db.patch(session._id, { status: "closed" as const });
      }
    }

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
// Internal session mutations (called from HTTP actions)
// ---------------------------------------------------------------------------

export const openSession = internalMutation({
  args: {
    userId: v.id("users"),
    slug: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Close existing active sessions for this slug so reopening doesn't hit the global limit.
    const existingForSlug = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    for (const session of existingForSlug) {
      if (session.userId === args.userId && session.status === "active") {
        await ctx.db.patch(session._id, { status: "closed" as const });
      }
    }

    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const active = existing.filter(
      (s) => s.status === "active" && s.expiresAt > Date.now() && s.slug !== args.slug,
    );
    if (active.length >= MAX_SESSIONS_PER_USER) {
      throw new Error(`Session limit reached (${MAX_SESSIONS_PER_USER})`);
    }

    const id = await ctx.db.insert("sessions", {
      slug: args.slug,
      userId: args.userId,
      status: "active",
      agentCandidates: [],
      browserCandidates: [],
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });

    await ctx.scheduler.runAt(args.expiresAt, internal.pubs.expireSession, { id });
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
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!session || session.userId !== userId) throw new Error("Session not found");
    if (session.status === "closed") throw new Error("Session closed");
    if (session.expiresAt < Date.now()) throw new Error("Session expired");

    const patch: Record<string, unknown> = {};
    const resetSignaling = offer !== undefined;

    if (resetSignaling) {
      patch.agentOffer = offer;
      patch.agentCandidates = [];
      patch.browserCandidates = [];
      patch.browserAnswer = "";
    }

    if (candidates?.length) {
      const base = resetSignaling ? [] : session.agentCandidates;
      const merged = [...base, ...candidates].slice(0, MAX_CANDIDATES);
      patch.agentCandidates = merged;
    }

    await ctx.db.patch(session._id, patch);
  },
});

export const closeSession = internalMutation({
  args: { slug: v.string(), userId: v.id("users") },
  handler: async (ctx, { slug, userId }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!session || session.userId !== userId) throw new Error("Session not found");
    await ctx.db.patch(session._id, { status: "closed" as const });
  },
});

export const expireSession = internalMutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, { id }) => {
    const session = await ctx.db.get(id);
    if (session && session.status === "active") {
      await ctx.db.patch(id, { status: "closed" as const });
    }
  },
});

// Internal queries for sessions

export const getSessionBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .order("desc")
      .first();
    if (!session || session.status === "closed" || session.expiresAt < Date.now()) return null;
    return session;
  },
});

export const listSessionsByUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return sessions
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
