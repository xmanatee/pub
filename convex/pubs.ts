import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { deleteConnectionsForSlug } from "./connections";
import { listFreshOnlineHosts } from "./presence";
import { PUB_OWNED_TABLES } from "./user_data";
import { generateSlug, MAX_PUBS, MAX_PUBS_SUBSCRIBED } from "./utils";

export async function deletePubOwnedRows(db: GenericDatabaseWriter<DataModel>, pubId: Id<"pubs">) {
  for (const { table, index } of PUB_OWNED_TABLES) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic table iteration
    const rows = await (db.query(table) as any)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic table iteration
      .withIndex(index, (q: any) => q.eq("pubId", pubId))
      .collect();
    for (const row of rows) {
      await db.delete(row._id);
    }
  }
}

function getPubLimit(user: { isSubscribed?: boolean }): number {
  return user.isSubscribed ? MAX_PUBS_SUBSCRIBED : MAX_PUBS;
}

export function buildPubPatch(fields: {
  title?: string;
  description?: string;
  isPublic?: boolean;
  slug?: string;
}) {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
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

async function generateUniqueSlug(db: GenericDatabaseReader<DataModel>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSlug();
    const existing = await db
      .query("pubs")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new Error("Could not generate unique slug");
}

function mapPub(pub: {
  _id: Id<"pubs">;
  slug: string;
  previewHtml?: string;
  title?: string;
  description?: string;
  isPublic: boolean;
  fileCount?: number;
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number;
  viewCount?: number;
}) {
  return {
    _id: pub._id,
    slug: pub.slug,
    previewHtml: pub.previewHtml,
    title: pub.title,
    description: pub.description,
    isPublic: pub.isPublic,
    fileCount: pub.fileCount ?? 0,
    createdAt: pub.createdAt,
    updatedAt: pub.updatedAt,
    lastViewedAt: pub.lastViewedAt,
    viewCount: pub.viewCount ?? 0,
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

    const mapped = mapPub(pub);

    const indexFile = await ctx.db
      .query("pubFiles")
      .withIndex("by_pub_path", (q) => q.eq("pubId", pub._id).eq("path", "index.html"))
      .unique();

    return { ...mapped, content: indexFile?.content, isOwner };
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
      page: result.page.map((pub) => mapPub(pub)),
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

export async function duplicatePubCore(
  db: GenericDatabaseWriter<DataModel>,
  userId: Id<"users">,
  pubId: Id<"pubs">,
): Promise<{ _id: Id<"pubs">; slug: string }> {
  const pub = await db.get(pubId);
  if (!pub || pub.userId !== userId) throw new Error("Pub not found");

  const user = await db.get(userId);
  const limit = getPubLimit(user ?? {});
  const count = await countUserPubs(db, userId);
  if (count >= limit) throw new Error(`Pub limit reached (${limit})`);

  const slug = await generateUniqueSlug(db);

  const now = Date.now();
  const newId = await db.insert("pubs", {
    userId,
    slug,
    previewHtml: pub.previewHtml,
    title: pub.title ? `${pub.title} (copy)` : undefined,
    description: pub.description,
    isPublic: false,
    fileCount: pub.fileCount,
    createdAt: now,
    updatedAt: now,
    lastViewedAt: now,
    viewCount: 0,
  });

  const files = await db
    .query("pubFiles")
    .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
    .collect();
  for (const file of files) {
    await db.insert("pubFiles", {
      pubId: newId,
      path: file.path,
      content: file.content,
      size: file.size,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { _id: newId, slug };
}

export const duplicateByUser = mutation({
  args: { id: v.id("pubs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return duplicatePubCore(ctx.db, userId, id);
  },
});

export const deleteByUser = mutation({
  args: { id: v.id("pubs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    await deletePubOwnedRows(ctx.db, id);
    await deleteConnectionsForSlug(ctx.db, pub.slug);
    await ctx.db.delete(id);
  },
});

export const createDraftForLive = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (listFreshOnlineHosts(hosts, Date.now()).length === 0) {
      throw new Error("Agent offline");
    }

    const user = await ctx.db.get(userId);
    const limit = getPubLimit(user ?? {});
    const count = await countUserPubs(ctx.db, userId);
    if (count >= limit) {
      throw new Error(`Pub limit reached (${limit})`);
    }

    const slug = await generateUniqueSlug(ctx.db);

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

    return ctx.db.insert("pubs", {
      userId: args.userId,
      slug: args.slug,
      title: args.title,
      description: args.description,
      isPublic: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewCount: 0,
    });
  },
});

export const updatePub = internalMutation({
  args: {
    id: v.id("pubs"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, { id, title, description, isPublic, slug }) => {
    const pub = await ctx.db.get(id);
    if (!pub) throw new Error("Pub not found");

    if (slug !== undefined && slug !== pub.slug) {
      const conns = await ctx.db
        .query("connections")
        .withIndex("by_active_slug", (q) => q.eq("activeSlug", pub.slug))
        .collect();
      for (const conn of conns) {
        if (conn.userId === pub.userId) {
          await ctx.db.patch(conn._id, { activeSlug: slug });
        }
      }
    }

    const patch = buildPubPatch({ title, description, isPublic, slug });
    await ctx.db.patch(id, patch);
  },
});

export const deletePub = internalMutation({
  args: { id: v.id("pubs"), userId: v.id("users") },
  handler: async (ctx, { id, userId }) => {
    const pub = await ctx.db.get(id);
    if (!pub || pub.userId !== userId) throw new Error("Pub not found");

    await deletePubOwnedRows(ctx.db, id);
    await deleteConnectionsForSlug(ctx.db, pub.slug);
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
