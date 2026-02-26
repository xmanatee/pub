import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { CONTENT_TYPE_VALIDATOR, MAX_PRIVATE_PUBS, MAX_PUBLIC_PUBS } from "./utils";

async function countUserPubs(db: GenericDatabaseReader<DataModel>, userId: Id<"users">) {
  const pubs = await db
    .query("publications")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return {
    publicCount: pubs.filter((p) => p.isPublic).length,
    privateCount: pubs.filter((p) => !p.isPublic).length,
  };
}

function mapPublication(
  pub: {
    _id: Id<"publications">;
    slug: string;
    contentType: string;
    content: string;
    title?: string;
    isPublic: boolean;
    expiresAt?: number;
    createdAt: number;
    updatedAt: number;
  },
  includeContent = false,
) {
  const dto: {
    _id: Id<"publications">;
    slug: string;
    contentType: string;
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
      .query("publications")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub) return null;

    if (!pub.isPublic) {
      const userId = await getAuthUserId(ctx);
      if (!userId || pub.userId !== userId) return null;
    }

    return mapPublication(pub, true);
  },
});

export const listByUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };

    const result = await ctx.db
      .query("publications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((p) => mapPublication(p)),
    };
  },
});

export const toggleVisibility = mutation({
  args: { id: v.id("publications") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Not found");

    if (!pub.isPublic) {
      const { publicCount } = await countUserPubs(ctx.db, userId);
      if (publicCount >= MAX_PUBLIC_PUBS) {
        throw new Error(`Public publication limit reached (${MAX_PUBLIC_PUBS})`);
      }
    }

    await ctx.db.patch(id, { isPublic: !pub.isPublic, updatedAt: Date.now() });
    return { isPublic: !pub.isPublic };
  },
});

export const deleteByUser = mutation({
  args: { id: v.id("publications") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Not found");

    await ctx.db.delete(id);
  },
});

export const createPublication = internalMutation({
  args: {
    userId: v.id("users"),
    slug: v.string(),
    contentType: CONTENT_TYPE_VALIDATOR,
    content: v.string(),
    title: v.optional(v.string()),
    isPublic: v.boolean(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { publicCount, privateCount } = await countUserPubs(ctx.db, args.userId);

    if (args.isPublic && publicCount >= MAX_PUBLIC_PUBS) {
      throw new Error(`Public publication limit reached (${MAX_PUBLIC_PUBS})`);
    }
    if (!args.isPublic && privateCount >= MAX_PRIVATE_PUBS) {
      throw new Error(`Private publication limit reached (${MAX_PRIVATE_PUBS})`);
    }

    const id = await ctx.db.insert("publications", {
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
      await ctx.scheduler.runAt(args.expiresAt, internal.publications.expire, { id });
    }

    return id;
  },
});

export const expire = internalMutation({
  args: { id: v.id("publications") },
  handler: async (ctx, { id }) => {
    const pub = await ctx.db.get(id);
    if (pub) await ctx.db.delete(id);
  },
});

export const updatePublication = internalMutation({
  args: {
    id: v.id("publications"),
    content: v.optional(v.string()),
    contentType: v.optional(CONTENT_TYPE_VALIDATOR),
    title: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, { id, content, contentType, title, isPublic, slug }) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (content !== undefined) patch.content = content;
    if (contentType !== undefined) patch.contentType = contentType;
    if (title !== undefined) patch.title = title;
    if (isPublic !== undefined) patch.isPublic = isPublic;
    if (slug !== undefined) patch.slug = slug;
    await ctx.db.patch(id, patch);
  },
});

export const getBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return ctx.db
      .query("publications")
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
      .query("publications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate({ cursor: cursor ?? null, numItems });

    return {
      publications: result.page,
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const deletePublication = internalMutation({
  args: { id: v.id("publications"), userId: v.id("users") },
  handler: async (ctx, { id, userId }) => {
    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

export const listPublic = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("publications")
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
      })),
    };
  },
});

export const listPublicByUserInternal = internalQuery({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return pubs.filter((p) => p.isPublic).slice(0, limit ?? 50);
  },
});
