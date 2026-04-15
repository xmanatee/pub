import { createServerFn } from "@tanstack/react-start";
import { createJsonStore } from "~/core/json-store";
import type { Note } from "./commands";

const store = createJsonStore<Note>("~/.pub-super-app/notes.json");

export const listNotes = createServerFn({ method: "GET" }).handler(async () => ({
  entries: await store.list(),
}));

export const createNote = createServerFn({ method: "POST" })
  .inputValidator((input: { title: string; body: string }) => input)
  .handler(async ({ data }) => ({
    entry: await store.append({ title: data.title, body: data.body }),
  }));

export const updateNote = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; title: string; body: string }) => input)
  .handler(async ({ data }) => ({
    entry: await store.update(data.id, { title: data.title, body: data.body }),
  }));

export const deleteNote = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await store.remove(data.id);
    return { id: data.id };
  });
