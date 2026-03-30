import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const writeFiles = internalMutation({
  args: {
    pubId: v.id("pubs"),
    files: v.array(v.object({ path: v.string(), content: v.string() })),
  },
  handler: async (ctx, { pubId, files }) => {
    const existing = await ctx.db
      .query("pubFiles")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .collect();
    for (const file of existing) {
      await ctx.db.delete(file._id);
    }

    const now = Date.now();
    for (const file of files) {
      await ctx.db.insert("pubFiles", {
        pubId,
        path: file.path,
        content: file.content,
        size: new TextEncoder().encode(file.content).byteLength,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(pubId, {
      fileCount: files.length,
      previewHtml: undefined,
      updatedAt: now,
    });
  },
});

export const getFile = internalQuery({
  args: { pubId: v.id("pubs"), path: v.string() },
  handler: async (ctx, { pubId, path }) => {
    return ctx.db
      .query("pubFiles")
      .withIndex("by_pub_path", (q) => q.eq("pubId", pubId).eq("path", path))
      .unique();
  },
});

export const listFilesWithContent = internalQuery({
  args: { pubId: v.id("pubs") },
  handler: async (ctx, { pubId }) => {
    return ctx.db
      .query("pubFiles")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .collect();
  },
});
