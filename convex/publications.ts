import { v } from "convex/values";
import {
  action,
  mutation,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const CONTENT_TYPES = ["html", "css", "js", "markdown", "text"] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function inferContentType(filename: string): ContentType {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
      return "js";
    case "md":
    case "markdown":
      return "markdown";
    default:
      return "text";
  }
}

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query("publications")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!pub) return null;

    // If private, only the owner can see it
    if (!pub.isPublic) {
      const userId = await auth.getUserId(ctx);
      if (!userId || pub.userId !== userId) return null;
    }

    return {
      _id: pub._id,
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

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return pubs.map((p) => ({
      _id: p._id,
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

export const toggleVisibility = mutation({
  args: { id: v.id("publications") },
  handler: async (ctx, { id }) => {
    const userId = await auth.getUserId(ctx);
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Not found");

    await ctx.db.delete(id);
  },
});

// --- Internal functions used by HTTP API ---

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

// --- Actions used by HTTP API (API key auth) ---

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
    const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, {
      key: apiKey,
    });
    if (!user) throw new Error("Invalid API key");

    await ctx.runMutation(internal.apiKeys.touchApiKey, {
      apiKeyId: user.apiKeyId,
    });

    if (content.length > MAX_CONTENT_SIZE) {
      throw new Error("Content exceeds maximum size of 1MB");
    }

    const contentType = inferContentType(filename);
    const finalSlug = slug || generateSlug();

    const existing = await ctx.runQuery(
      internal.publications.getBySlugInternal,
      { slug: finalSlug },
    );

    if (existing) {
      if (existing.userId !== user.userId) {
        throw new Error("Slug already taken");
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
    const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, {
      key: apiKey,
    });
    if (!user) throw new Error("Invalid API key");

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, {
      slug,
    });
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
  handler: async (ctx, { apiKey, slug }) => {
    const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, {
      key: apiKey,
    });
    if (!user) throw new Error("Invalid API key");

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, {
      slug,
    });
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
  handler: async (ctx, { apiKey }) => {
    const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, {
      key: apiKey,
    });
    if (!user) throw new Error("Invalid API key");

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
  handler: async (ctx, { apiKey, slug, title, isPublic }) => {
    const user = await ctx.runQuery(internal.apiKeys.getUserByApiKey, {
      key: apiKey,
    });
    if (!user) throw new Error("Invalid API key");

    const pub = await ctx.runQuery(internal.publications.getBySlugInternal, {
      slug,
    });
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
