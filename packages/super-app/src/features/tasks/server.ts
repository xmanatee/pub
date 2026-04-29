import { createServerFn } from "@tanstack/react-start";
import { createJsonStore } from "~/core/json-store";
import type { Task } from "./commands";

const store = createJsonStore<Task>("~/.pub-super-app/tasks.json");

export const listTasks = createServerFn({ method: "GET" }).handler(async () => ({
  entries: await store.list(),
}));

export const createTask = createServerFn({ method: "POST" })
  .inputValidator((input: { title: string }) => input)
  .handler(async ({ data }) => ({
    entry: await store.append({
      title: data.title,
      status: "analyzing",
      priority: "medium",
      category: "other",
      estimatedTime: null,
      subtasks: [],
      recurrence: null,
      lastCompletedAt: null,
      note: null,
      comments: [],
      analyzed: false,
    }),
  }));

export const updateTask = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; patch: Partial<Task> }) => input)
  .handler(async ({ data }) => ({ entry: await store.update(data.id, data.patch) }));

export const deleteTask = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await store.remove(data.id);
    return { id: data.id };
  });
