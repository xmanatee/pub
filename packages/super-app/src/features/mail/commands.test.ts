import { describe, expect, it } from "vitest";
import {
  archiveMessage,
  listInbox,
  markAsRead,
  parseMailListResult,
  parseMailMessageDetail,
  readMessage,
  starMessage,
  trashMessage,
} from "./commands";

describe("mail command result parsers", () => {
  it("runs shell commands with strict pipeline failure handling", () => {
    for (const command of [listInbox, readMessage]) {
      expect(command.executor?.kind).toBe("shell");
      if (command.executor?.kind !== "shell") throw new Error(`${command.name} must use shell`);
      expect(command.executor.shell).toBe("/bin/bash");
      expect(command.executor.script).toMatch(/^set -euo pipefail; /);
    }
  });

  it("uses the current gog message command contract", () => {
    expect(readMessage.executor?.kind).toBe("shell");
    if (readMessage.executor?.kind !== "shell") throw new Error("mail.read must use shell");
    expect(readMessage.executor.script).toContain("gog -j gmail get {{id}}");
    expect(readMessage.executor.script).not.toContain("--id {{id}}");
    expect(readMessage.executor.script).toContain("id: .message.id");
    expect(readMessage.executor.script).toContain("from: .headers.from");
    expect(readMessage.executor.script).toContain("labels: .message.labelIds");
    expect(archiveMessage.executor).toMatchObject({
      kind: "exec",
      command: "gog",
      args: ["gmail", "archive", "{{id}}"],
    });
    expect(trashMessage.executor).toMatchObject({
      kind: "exec",
      command: "gog",
      args: ["gmail", "trash", "{{id}}"],
    });
    expect(markAsRead.executor).toMatchObject({
      kind: "exec",
      command: "gog",
      args: ["gmail", "mark-read", "{{id}}"],
    });
    expect(starMessage.executor).toMatchObject({
      kind: "exec",
      command: "gog",
      args: ["gmail", "messages", "modify", "{{id}}", "--add", "STARRED"],
    });
  });

  it("parses inbox list output", () => {
    expect(
      parseMailListResult({
        messages: [
          {
            id: "msg-1",
            threadId: "thread-1",
            from: "Ada",
            to: null,
            subject: "Review",
            date: "Thu, 04 Jun 2026 09:00:00 +0000",
            snippet: "Please review this.",
            unread: true,
            labels: ["INBOX", "UNREAD"],
          },
        ],
      }),
    ).toEqual({
      messages: [
        {
          id: "msg-1",
          threadId: "thread-1",
          from: "Ada",
          to: null,
          subject: "Review",
          date: "Thu, 04 Jun 2026 09:00:00 +0000",
          snippet: "Please review this.",
          unread: true,
          labels: ["INBOX", "UNREAD"],
        },
      ],
    });
  });

  it("parses message detail output", () => {
    expect(
      parseMailMessageDetail({
        id: "msg-1",
        threadId: "thread-1",
        from: "Ada",
        to: "grace@example.com",
        subject: "Review",
        date: "Thu, 04 Jun 2026 09:00:00 +0000",
        snippet: "Please review this.",
        unread: false,
        labels: ["INBOX"],
        body: "Please review this.",
        bodyHtml: null,
      }),
    ).toEqual({
      id: "msg-1",
      threadId: "thread-1",
      from: "Ada",
      to: "grace@example.com",
      subject: "Review",
      date: "Thu, 04 Jun 2026 09:00:00 +0000",
      snippet: "Please review this.",
      unread: false,
      labels: ["INBOX"],
      body: "Please review this.",
      bodyHtml: null,
    });
  });

  it("rejects list output without a messages array", () => {
    expect(() => parseMailListResult({ messages: undefined })).toThrow(
      "mail.list.messages must be an array",
    );
  });
});
