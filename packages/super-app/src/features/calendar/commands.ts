import { strictShell } from "~/core/command-shell";
import {
  type JsonRecord,
  readArray,
  readNullableString,
  readRecordValue,
  readString,
} from "~/core/json-boundary";
import type { CommandFunctionSpec } from "~/core/types";

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  start: string;
  end: string;
  location: string | null;
  link: string | null;
  attendees: string[];
}

export interface CalendarListResult {
  events: CalendarEvent[];
}

export const listEvents: CommandFunctionSpec = {
  name: "calendar.list",
  returns: "json",
  executor: strictShell(
    "gog -j calendar events --from {{from}} --to {{to}} --max {{max}} | " +
      'jq \'{events: [.events[]? | {id, summary: (.summary // "(untitled)"), description: (.description // null),' +
      ' start: (.start.dateTime // .start.date // ""), end: (.end.dateTime // .end.date // ""),' +
      " location: (.location // null), link: (.htmlLink // null), attendees: [(.attendees // [])[].email]}]}'",
  ),
};

export const createEvent: CommandFunctionSpec = {
  name: "calendar.create",
  returns: "json",
  executor: {
    kind: "exec",
    command: "gog",
    args: [
      "-j",
      "calendar",
      "create",
      "--summary",
      "{{summary}}",
      "--start",
      "{{start}}",
      "--end",
      "{{end}}",
      "--description",
      "{{description}}",
      "--location",
      "{{location}}",
    ],
  },
};

export const updateEvent: CommandFunctionSpec = {
  name: "calendar.update",
  returns: "json",
  executor: {
    kind: "exec",
    command: "gog",
    args: [
      "-j",
      "calendar",
      "update",
      "--id",
      "{{id}}",
      "--summary",
      "{{summary}}",
      "--start",
      "{{start}}",
      "--end",
      "{{end}}",
      "--description",
      "{{description}}",
      "--location",
      "{{location}}",
    ],
  },
};

export const deleteEvent: CommandFunctionSpec = {
  name: "calendar.delete",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["calendar", "delete", "--id", "{{id}}"],
  },
};

function readOptionalNullableString(record: JsonRecord, key: string, path: string): string | null {
  if (!(key in record)) return null;
  return readNullableString(record, key, path);
}

function readCalendarTime(record: JsonRecord, key: string, path: string): string {
  const value = record[key];
  if (typeof value === "string") return value;

  const time = readRecordValue(value, `${path}.${key}`);
  const dateTime = time.dateTime;
  if (typeof dateTime === "string") return dateTime;
  const date = time.date;
  if (typeof date === "string") return date;
  throw new Error(`${path}.${key} must include dateTime or date`);
}

function readCalendarLink(record: JsonRecord, path: string): string | null {
  if ("link" in record) return readNullableString(record, "link", path);
  if ("htmlLink" in record) return readString(record, "htmlLink", path);
  return null;
}

function readCalendarAttendees(record: JsonRecord, path: string): string[] {
  if (!("attendees" in record)) return [];
  const attendees = readArray(record, "attendees", path);
  return attendees.map((attendee, index) => {
    if (typeof attendee === "string") return attendee;
    const attendeeRecord = readRecordValue(attendee, `${path}.attendees[${index}]`);
    return readString(attendeeRecord, "email", `${path}.attendees[${index}]`);
  });
}

export function parseCalendarEvent(value: unknown, path = "calendar.event"): CalendarEvent {
  const record = readRecordValue(value, path);
  return {
    id: readString(record, "id", path),
    summary: readString(record, "summary", path),
    description: readOptionalNullableString(record, "description", path),
    start: readCalendarTime(record, "start", path),
    end: readCalendarTime(record, "end", path),
    location: readOptionalNullableString(record, "location", path),
    link: readCalendarLink(record, path),
    attendees: readCalendarAttendees(record, path),
  };
}

export function parseCalendarListResult(value: unknown): CalendarListResult {
  const path = "calendar.list";
  const record = readRecordValue(value, path);
  return {
    events: readArray(record, "events", path).map((event, index) =>
      parseCalendarEvent(event, `${path}.events[${index}]`),
    ),
  };
}
