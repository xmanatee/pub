import { describe, expect, it } from "vitest";
import {
  createEvent,
  deleteEvent,
  listEvents,
  parseCalendarEvent,
  parseCalendarFreeBusyResult,
  parseCalendarListResult,
  updateEvent,
} from "./commands";

describe("calendar command result parsers", () => {
  it("runs shell commands with strict pipeline failure handling", () => {
    expect(listEvents.executor?.kind).toBe("shell");
    if (listEvents.executor?.kind !== "shell") throw new Error("calendar.list must use shell");
    expect(listEvents.executor.shell).toBe("/bin/bash");
    expect(listEvents.executor.script).toMatch(/^set -euo pipefail; /);
  });

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

  it("uses current gog calendar create, update, and delete arguments", () => {
    expect(createEvent.executor?.kind).toBe("exec");
    expect(updateEvent.executor?.kind).toBe("exec");
    expect(deleteEvent.executor?.kind).toBe("exec");
    if (
      createEvent.executor?.kind !== "exec" ||
      updateEvent.executor?.kind !== "exec" ||
      deleteEvent.executor?.kind !== "exec"
    ) {
      throw new Error("calendar mutations must use exec");
    }

    expect(createEvent.executor.args).toContain("primary");
    expect(createEvent.executor.args).toContain("--from");
    expect(createEvent.executor.args).toContain("--to");
    expect(createEvent.executor.args).toContain("--attendees");
    expect(createEvent.executor.args).not.toContain("--start");
    expect(createEvent.executor.args).not.toContain("--end");
    expect(updateEvent.executor.args).toEqual(
      expect.arrayContaining(["primary", "{{id}}", "--from", "--to", "--attendees"]),
    );
    expect(deleteEvent.executor.args).toEqual(["-y", "calendar", "delete", "primary", "{{id}}"]);
  });

  it("parses free/busy output with empty calendars and busy slots", () => {
    expect(
      parseCalendarFreeBusyResult({
        calendars: {
          primary: {},
          work: {
            busy: [{ start: "2026-06-04T09:00:00Z", end: "2026-06-04T10:00:00Z" }],
            errors: [{ domain: "calendar", reason: "notFound" }],
          },
        },
      }),
    ).toEqual({
      calendars: [
        { id: "primary", busy: [], errors: [] },
        {
          id: "work",
          busy: [{ start: "2026-06-04T09:00:00Z", end: "2026-06-04T10:00:00Z" }],
          errors: ["notFound"],
        },
      ],
    });
  });

  it("rejects list output without an events array", () => {
    expect(() => parseCalendarListResult({ events: null })).toThrow(
      "calendar.list.events must be an array",
    );
  });
});
