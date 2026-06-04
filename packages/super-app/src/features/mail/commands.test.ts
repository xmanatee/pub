import { describe, expect, it } from "vitest";
import { parseMailListResult, parseMailMessageDetail } from "./commands";

describe("mail command result parsers", () => {
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
