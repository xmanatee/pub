import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { ContentType } from "./utils";

function mapPublication(
  pub: {
    _id: Id<"publications">;
    slug: string;
    contentType: string;
    content: string;
    title?: string;
    isPublic: boolean;
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
    createdAt: number;
    updatedAt: number;
    content?: string;
  } = {
    _id: pub._id,
    slug: pub.slug,
    contentType: pub.contentType,
    title: pub.title,
    isPublic: pub.isPublic,
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
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return pubs.map((p) => mapPublication(p));
  },
});

export const toggleVisibility = mutation({
  args: { id: v.id("publications") },
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
    contentType: v.string(),
    content: v.string(),
    title: v.optional(v.string()),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("publications", {
      ...args,
      contentType: args.contentType as ContentType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updatePublication = internalMutation({
  args: {
    id: v.id("publications"),
    content: v.optional(v.string()),
    contentType: v.optional(v.string()),
    title: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, content, contentType, title, isPublic }) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (content !== undefined) patch.content = content;
    if (contentType !== undefined) patch.contentType = contentType;
    if (title !== undefined) patch.title = title;
    if (isPublic !== undefined) patch.isPublic = isPublic;
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
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("publications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
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
