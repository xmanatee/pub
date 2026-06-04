import { describe, expect, it } from "vitest";
import { parseTaskAnalysis, parseTaskCommentResponse, parseTriageTasksResult } from "./ai-results";

describe("task AI result parsers", () => {
  it("parses task analysis", () => {
    expect(
      parseTaskAnalysis({
        priority: "high",
        category: "work",
        estimatedTime: "1h",
        subtasks: ["Review diff"],
        recurrence: null,
        dueAt: null,
        note: "Release prep",
      }),
    ).toEqual({
      priority: "high",
      category: "work",
      estimatedTime: "1h",
      subtasks: ["Review diff"],
      recurrence: null,
      dueAt: null,
      note: "Release prep",
    });
  });

  it("parses triage changes without fallback arrays", () => {
    expect(
      parseTriageTasksResult({
        changes: [{ id: "task-1", priority: "urgent", reason: "Due today" }],
      }),
    ).toEqual({
      changes: [{ id: "task-1", priority: "urgent", reason: "Due today" }],
    });
  });

  it("normalizes comment patch subtasks", () => {
    const parsed = parseTaskCommentResponse({
      reply: "Added concrete next steps.",
      patch: { priority: "medium", subtasks: ["Email reviewer"] },
    });

    expect(parsed.reply).toBe("Added concrete next steps.");
    expect(parsed.patch?.priority).toBe("medium");
    expect(parsed.patch?.subtasks).toHaveLength(1);
    expect(parsed.patch?.subtasks?.[0]?.text).toBe("Email reviewer");
    expect(parsed.patch?.subtasks?.[0]?.done).toBe(false);
  });

  it("rejects triage output without a changes array", () => {
    expect(() => parseTriageTasksResult({ changes: undefined })).toThrow(
      "ai.triage-tasks.changes must be an array",
    );
  });

  it("rejects undefined values in comment patches", () => {
    expect(() =>
      parseTaskCommentResponse({
        reply: "No change.",
        patch: { estimatedTime: undefined },
      }),
    ).toThrow("ai.process-task-comment.patch.estimatedTime must be a string or null");
  });
});
