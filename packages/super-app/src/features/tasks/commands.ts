/**
 * Task entity. AI flows live in `core/ai/prompts` (analyzeTask, triageTasks,
 * processTaskComment) — this file owns only the data shape.
 */
export const TASK_PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_CATEGORIES = [
  "work",
  "personal",
  "health",
  "finance",
  "shopping",
  "learning",
  "social",
  "home",
  "other",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_ESTIMATES = ["15m", "30m", "1h", "2h", "3h", "1d"] as const;
export type TaskEstimate = (typeof TASK_ESTIMATES)[number];

export const TASK_RECURRENCES = ["daily", "weekdays", "weekly", "biweekly", "monthly"] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export type TaskStatus = "analyzing" | "active" | "done" | "archived";

export interface TaskSubtask {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: string;
  ts: number;
  comment: string;
  reply: string;
}

export interface Task {
  id: string;
  createdAt: number;
  updatedAt: number | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  estimatedTime: TaskEstimate | null;
  subtasks: TaskSubtask[];
  recurrence: TaskRecurrence | null;
  /** Last-completed timestamp; the next due date for recurring tasks is derived from this. */
  lastCompletedAt: number | null;
  note: string | null;
  comments: TaskComment[];
  /** True if AI has analyzed (priority/category/subtasks/recurrence) at least once. */
  analyzed: boolean;
}

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};
