import { describe, expect, it } from "vitest";
import { parseCalendarEvent, parseCalendarListResult } from "./commands";

describe("calendar command result parsers", () => {
  it("parses normalized list output", () => {
    expect(
      parseCalendarListResult({
        events: [
          {
            id: "event-1",
            summary: "Planning",
            description: null,
            start: "2026-06-04T09:00:00Z",
            end: "2026-06-04T10:00:00Z",
            location: null,
            link: "https://calendar.google.com/event?eid=event-1",
            attendees: ["ada@example.com"],
          },
        ],
      }),
    ).toEqual({
      events: [
        {
          id: "event-1",
          summary: "Planning",
          description: null,
          start: "2026-06-04T09:00:00Z",
          end: "2026-06-04T10:00:00Z",
          location: null,
          link: "https://calendar.google.com/event?eid=event-1",
          attendees: ["ada@example.com"],
        },
      ],
    });
  });

  it("normalizes raw Google event output from create and update commands", () => {
    expect(
      parseCalendarEvent(
        {
          id: "event-2",
          summary: "Review",
          start: { dateTime: "2026-06-04T11:00:00Z" },
          end: { date: "2026-06-05" },
          htmlLink: "https://calendar.google.com/event?eid=event-2",
          attendees: [{ email: "grace@example.com" }],
        },
        "calendar.create",
      ),
    ).toEqual({
      id: "event-2",
      summary: "Review",
      description: null,
      start: "2026-06-04T11:00:00Z",
      end: "2026-06-05",
      location: null,
      link: "https://calendar.google.com/event?eid=event-2",
      attendees: ["grace@example.com"],
    });
  });

  it("rejects list output without an events array", () => {
    expect(() => parseCalendarListResult({ events: null })).toThrow(
      "calendar.list.events must be an array",
    );
  });
});
