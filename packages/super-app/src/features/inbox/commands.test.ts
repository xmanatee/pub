import { describe, expect, it } from "vitest";
import { parseFlaggedMailResult, parseGitHubMilestones, parseTaskwarriorTasks } from "./commands";

describe("inbox command result parsers", () => {
  it("parses GitHub milestones", () => {
    expect(
      parseGitHubMilestones([
        {
          id: 12,
          title: "Launch",
          due_on: "2026-06-30T00:00:00Z",
          html_url: "https://github.com/acme/project/milestone/1",
          open_issues: 4,
        },
      ]),
    ).toEqual([
      {
        id: 12,
        title: "Launch",
        due_on: "2026-06-30T00:00:00Z",
        html_url: "https://github.com/acme/project/milestone/1",
        open_issues: 4,
      },
    ]);
  });

  it("parses Taskwarrior tasks with optional metadata", () => {
    expect(
      parseTaskwarriorTasks([
        {
          uuid: "task-1",
          description: "Ship release",
          due: "20260630T000000Z",
          urgency: 9.5,
          status: "pending",
        },
        {
          uuid: "task-2",
          description: "Write notes",
        },
      ]),
    ).toEqual([
      {
        uuid: "task-1",
        description: "Ship release",
        due: "20260630T000000Z",
        urgency: 9.5,
        status: "pending",
      },
      {
        uuid: "task-2",
        description: "Write notes",
        due: undefined,
        urgency: undefined,
        status: undefined,
      },
    ]);
  });

  it("parses flagged mail output", () => {
    expect(
      parseFlaggedMailResult({
        messages: [
          {
            id: "msg-1",
            threadId: "thread-1",
            from: "Ada",
            subject: "Important",
            date: "Thu, 04 Jun 2026 09:00:00 +0000",
          },
        ],
      }),
    ).toEqual({
      messages: [
        {
          id: "msg-1",
          threadId: "thread-1",
          from: "Ada",
          subject: "Important",
          date: "Thu, 04 Jun 2026 09:00:00 +0000",
        },
      ],
    });
  });

  it("rejects non-array GitHub output", () => {
    expect(() => parseGitHubMilestones({ milestones: [] })).toThrow(
      "inbox.deadlines.github must be an array",
    );
  });
});
