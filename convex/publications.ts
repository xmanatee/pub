import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  type ContentType,
  generateSlug,
  inferContentType,
  isValidSlug,
  MAX_CONTENT_SIZE,
} from "./utils";

function mapPublication(
  pub: {
    _id: Id<"publications">;
    slug: string;
    filename: string;
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
    filename: string;
    contentType: string;
    title?: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
    content?: string;
  } = {
    _id: pub._id,
    slug: pub.slug,
    filename: pub.filename,
    contentType: pub.contentType,
    title: pub.title,
    isPublic: pub.isPublic,
    createdAt: pub.createdAt,
    updatedAt: pub.updatedAt,
  };
  if (includeContent) dto.content = pub.content;
  return dto;
}

async function authenticateApiKey(
  ctx: ActionCtx,
  apiKey: string,
): Promise<{ apiKeyId: Id<"apiKeys">; userId: Id<"users"> }> {
  const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, { key: apiKey });
  if (!user) throw new Error("Invalid API key");
  await ctx.runMutation(internal.apiKeys.touchApiKey, { apiKeyId: user.apiKeyId, key: apiKey });
  return user;
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
    filename: v.string(),
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
    title: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, content, title, isPublic }) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (content !== undefined) patch.content = content;
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

export const publish = action({
  args: {
    apiKey: v.string(),
    filename: v.string(),
    content: v.string(),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, { apiKey, filename, content, title, slug, isPublic }) => {
    const user = await authenticateApiKey(ctx, apiKey);

    if (content.length > MAX_CONTENT_SIZE) {
      throw new Error("Content exceeds maximum size of 1MB");
    }

    const contentType = inferContentType(filename);
    if (slug && !isValidSlug(slug)) {
      throw new Error(
        "Invalid slug format. Use 1-64 chars: letters, numbers, dot, dash, or underscore.",
      );
    }
    const finalSlug = slug || generateSlug();

    const existing = await ctx.runQuery(internal.publications.getBySlugInternal, {
      slug: finalSlug,
    });

    if (existing) {
      if (existing.userId !== user.userId) {
        throw new Error("Slug already taken by another user");
      }
      await ctx.runMutation(internal.publications.updatePublication, {
        id: existing._id,
        content,
        title,
        isPublic,
      });
      return { slug: finalSlug, updated: true };
    }

    await ctx.runMutation(internal.publications.createPublication, {
      userId: user.userId,
      slug: finalSlug,
      filename,
      contentType,
      content,
      title,
      isPublic: isPublic ?? true,
    });

    return { slug: finalSlug, updated: false };
  },
});

export const unpublish = action({
  args: { apiKey: v.string(), slug: v.string() },
  handler: async (ctx, { apiKey, slug }) => {
    const user = await authenticateApiKey(ctx, apiKey);

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
    if (!pub || pub.userId !== user.userId) {
      throw new Error("Publication not found");
    }

    await ctx.runMutation(internal.publications.deletePublication, {
      id: pub._id,
      userId: user.userId,
    });
  },
});

export const getViaApi = action({
  args: { apiKey: v.string(), slug: v.string() },
  handler: async (
    ctx,
    { apiKey, slug },
  ): Promise<{
    slug: string;
    filename: string;
    contentType: string;
    content: string;
    title?: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
  }> => {
    const user = await authenticateApiKey(ctx, apiKey);

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
    if (!pub || pub.userId !== user.userId) {
      throw new Error("Publication not found");
    }

    return {
      slug: pub.slug,
      filename: pub.filename,
      contentType: pub.contentType,
      content: pub.content,
      title: pub.title,
      isPublic: pub.isPublic,
      createdAt: pub.createdAt,
      updatedAt: pub.updatedAt,
    };
  },
});

export const listViaApi = action({
  args: { apiKey: v.string() },
  handler: async (
    ctx,
    { apiKey },
  ): Promise<
    {
      slug: string;
      filename: string;
      contentType: string;
      title?: string;
      isPublic: boolean;
      createdAt: number;
      updatedAt: number;
    }[]
  > => {
    const user = await authenticateApiKey(ctx, apiKey);

    const pubs = await ctx.runQuery(internal.publications.listByUserInternal, {
      userId: user.userId,
    });

    return pubs.map((p) => ({
      slug: p.slug,
      filename: p.filename,
      contentType: p.contentType,
      title: p.title,
      isPublic: p.isPublic,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  },
});

export const updateViaApi = action({
  args: {
    apiKey: v.string(),
    slug: v.string(),
    title: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { apiKey, slug, title, isPublic },
  ): Promise<{ slug: string; title?: string; isPublic: boolean }> => {
    const user = await authenticateApiKey(ctx, apiKey);

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, { slug });
    if (!pub || pub.userId !== user.userId) {
      throw new Error("Publication not found");
    }

    await ctx.runMutation(internal.publications.updatePublication, {
      id: pub._id,
      title,
      isPublic,
    });

    return {
      slug: pub.slug,
      title: title !== undefined ? title : pub.title,
      isPublic: isPublic !== undefined ? isPublic : pub.isPublic,
    };
  },
});
