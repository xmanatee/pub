import { createServerFn } from "@tanstack/react-start";
import { createJsonStore } from "~/core/json-store.server";
import type { Note } from "./commands";
import { renderMarkdownToSafeHtml } from "./markdown";

const store = createJsonStore<Note>("~/.pub-super-app/notes.json");

export const listNotes = createServerFn({ method: "GET" }).handler(async () => ({
  entries: await store.list(),
}));

export const createNote = createServerFn({ method: "POST" })
  .validator((input: { title: string; body: string }) => input)
  .handler(async ({ data }) => ({
    entry: await store.append({ title: data.title, body: data.body }),
  }));

export const updateNote = createServerFn({ method: "POST" })
  .validator((input: { id: string; title: string; body: string }) => input)
  .handler(async ({ data }) => ({
    entry: await store.update(data.id, { title: data.title, body: data.body }),
  }));

export const deleteNote = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await store.remove(data.id);
    return { id: data.id };
  });

export const renderNoteMarkdown = createServerFn({ method: "POST" })
  .validator((input: { markdown: string }) => {
    if (!input || typeof input !== "object" || typeof input.markdown !== "string") {
      throw new Error("notes.renderMarkdown requires markdown");
    }
    return input;
  })
  .handler(async ({ data }) => ({
    html: renderMarkdownToSafeHtml(data.markdown),
  }));
