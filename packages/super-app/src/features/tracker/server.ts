import { createServerFn } from "@tanstack/react-start";
import { createJsonStore } from "~/core/json-store";
import type { TrackerEntry } from "./commands";

const store = createJsonStore<TrackerEntry>("~/.pub-super-app/tracker.json");

export const listTracker = createServerFn({ method: "GET" }).handler(async () => ({
  entries: await store.list(),
}));

export const addTracker = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string; category: string | null }) => input)
  .handler(async ({ data }) => ({
    entry: await store.append({ text: data.text, category: data.category }),
  }));

export const deleteTracker = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await store.remove(data.id);
    return { id: data.id };
  });
