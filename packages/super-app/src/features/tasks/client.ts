import type { Task } from "./commands";
import { createTask, deleteTask, listTasks, updateTask } from "./server";

export const tasksApi = {
  list: (): Promise<{ entries: Task[] }> => listTasks(),
  create: (title: string): Promise<{ entry: Task }> => createTask({ data: { title } }),
  update: (id: string, patch: Partial<Task>): Promise<{ entry: Task }> =>
    updateTask({ data: { id, patch } }),
  delete: (id: string): Promise<{ id: string }> => deleteTask({ data: { id } }),
};
