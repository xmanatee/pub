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
    entry: await store.append({ title: data.title, completed: false }),
  }));

export const updateTask = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string } & Partial<Pick<Task, "title" | "completed">>) => input)
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    return { entry: await store.update(id, patch) };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await store.remove(data.id);
    return { id: data.id };
  });
