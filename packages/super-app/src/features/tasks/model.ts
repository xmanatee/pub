/**
 * Pure logic for tasks: priority sort, recurrence next-due, smart-view filters.
 * Kept pure so it's unit-testable without React.
 */
import { PRIORITY_RANK, type Task, type TaskRecurrence } from "./commands";

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(ts: number, days: number): number {
  return ts + days * DAY_MS;
}

function nextWeekday(from: number): number {
  const d = new Date(from + DAY_MS);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function nextDueAt(task: Task, now: number = Date.now()): number | null {
  if (!task.recurrence) return task.dueAt ?? null;
  const base = task.lastCompletedAt ?? task.createdAt;
  switch (task.recurrence) {
    case "daily":
      return addDays(base, 1);
    case "weekdays":
      return nextWeekday(Math.max(base, now - DAY_MS));
    case "weekly":
      return addDays(base, 7);
    case "biweekly":
      return addDays(base, 14);
    case "monthly": {
      const d = new Date(base);
      d.setMonth(d.getMonth() + 1);
      return d.getTime();
    }
  }
}

export function isOverdue(task: Task, now: number = Date.now()): boolean {
  const due = nextDueAt(task, now);
  return due !== null && due < now;
}

export function compareForActiveList(a: Task, b: Task): number {
  // Analyzing first, then by priority, then by recency.
  if (a.status === "analyzing" && b.status !== "analyzing") return -1;
  if (b.status === "analyzing" && a.status !== "analyzing") return 1;
  const ad = nextDueAt(a);
  const bd = nextDueAt(b);
  if (ad !== null || bd !== null) {
    if (ad === null) return 1;
    if (bd === null) return -1;
    if (ad !== bd) return ad - bd;
  }
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  const ao = a.order ?? a.createdAt;
  const bo = b.order ?? b.createdAt;
  if (ao !== bo) return ao - bo;
  return b.createdAt - a.createdAt;
}

export type SmartView = "all" | "priority" | "recurring" | "inbox";

export function filterForView(tasks: Task[], view: SmartView): Task[] {
  if (view === "inbox") return tasks.filter((t) => t.status === "analyzing");
  if (view === "priority")
    return tasks.filter(
      (t) => t.status === "active" && (t.priority === "urgent" || t.priority === "high"),
    );
  if (view === "recurring")
    return tasks.filter((t) => t.status === "active" && t.recurrence !== null);
  return tasks.filter((t) => t.status === "active");
}

/** Pretty label for recurrence. */
export function recurrenceLabel(rec: TaskRecurrence | null): string | null {
  if (!rec) return null;
  return rec.charAt(0).toUpperCase() + rec.slice(1);
}
