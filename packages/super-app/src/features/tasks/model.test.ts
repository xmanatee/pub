/**
 * Pure-logic tests for the tasks model — recurrence math + smart-view
 * filters. Catches regressions before they hit the UI.
 */
import { describe, expect, it } from "vitest";
import type { Task } from "./commands";
import { compareForActiveList, filterForView, isOverdue, nextDueAt } from "./model";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    createdAt: 1_700_000_000_000,
    updatedAt: null,
    title: "thing",
    status: "active",
    priority: "medium",
    category: "other",
    estimatedTime: null,
    subtasks: [],
    recurrence: null,
    lastCompletedAt: null,
    note: null,
    comments: [],
    analyzed: false,
    ...overrides,
  };
}

describe("tasks model", () => {
  it("nextDueAt returns null for non-recurring tasks", () => {
    expect(nextDueAt(task())).toBeNull();
  });

  it("nextDueAt advances by 7 days for weekly", () => {
    const t = task({ recurrence: "weekly", lastCompletedAt: 1_700_000_000_000 });
    const due = nextDueAt(t);
    expect(due).toBe(1_700_000_000_000 + 7 * 24 * 3600 * 1000);
  });

  it("isOverdue is true when next-due is in the past", () => {
    const t = task({ recurrence: "daily", lastCompletedAt: 1_000_000_000_000 });
    expect(isOverdue(t, 2_000_000_000_000)).toBe(true);
  });

  it("compareForActiveList puts analyzing tasks first", () => {
    const a = task({ id: "a", priority: "low", status: "analyzing" });
    const b = task({ id: "b", priority: "urgent", status: "active" });
    expect([a, b].sort(compareForActiveList)[0].id).toBe("a");
  });

  it("filterForView('priority') keeps only urgent/high active tasks", () => {
    const tasks = [
      task({ id: "1", priority: "urgent", status: "active" }),
      task({ id: "2", priority: "high", status: "active" }),
      task({ id: "3", priority: "medium", status: "active" }),
      task({ id: "4", priority: "urgent", status: "done" }),
    ];
    const ids = filterForView(tasks, "priority").map((t) => t.id);
    expect(ids.sort()).toEqual(["1", "2"]);
  });

  it("filterForView('inbox') keeps only analyzing tasks", () => {
    const tasks = [task({ id: "1", status: "analyzing" }), task({ id: "2", status: "active" })];
    const ids = filterForView(tasks, "inbox").map((t) => t.id);
    expect(ids).toEqual(["1"]);
  });
});
