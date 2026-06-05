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

export interface CalendarBusySlot {
  start: string;
  end: string;
}

export interface CalendarFreeBusyCalendar {
  id: string;
  busy: CalendarBusySlot[];
  errors: string[];
}

export interface CalendarFreeBusyResult {
  calendars: CalendarFreeBusyCalendar[];
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
      "primary",
      "--summary",
      "{{summary}}",
      "--from",
      "{{start}}",
      "--to",
      "{{end}}",
      "--description",
      "{{description}}",
      "--location",
      "{{location}}",
      "--attendees",
      "{{attendees}}",
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
      "primary",
      "{{id}}",
      "--summary",
      "{{summary}}",
      "--from",
      "{{start}}",
      "--to",
      "{{end}}",
      "--description",
      "{{description}}",
      "--location",
      "{{location}}",
      "--attendees",
      "{{attendees}}",
    ],
  },
};

export const deleteEvent: CommandFunctionSpec = {
  name: "calendar.delete",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["-y", "calendar", "delete", "primary", "{{id}}"],
  },
};

export const freeBusy: CommandFunctionSpec = {
  name: "calendar.freeBusy",
  returns: "json",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["-j", "calendar", "freebusy", "{{calendarIds}}", "--from", "{{from}}", "--to", "{{to}}"],
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

function readOptionalRecord(record: JsonRecord, key: string, path: string): JsonRecord | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  return readRecordValue(value, `${path}.${key}`);
}

function readOptionalArray(record: JsonRecord, key: string, path: string): unknown[] {
  const value = record[key];
  if (value === undefined || value === null) return [];
  return readArray(record, key, path);
}

export function parseCalendarFreeBusyResult(value: unknown): CalendarFreeBusyResult {
  const path = "calendar.freeBusy";
  const record = readRecordValue(value, path);
  const calendars = readOptionalRecord(record, "calendars", path);
  if (!calendars) return { calendars: [] };

  return {
    calendars: Object.entries(calendars).map(([id, calendar]) => {
      const calendarRecord = readRecordValue(calendar, `${path}.calendars.${id}`);
      return {
        id,
        busy: readOptionalArray(calendarRecord, "busy", `${path}.calendars.${id}`).map(
          (slot, index) => {
            const slotRecord = readRecordValue(slot, `${path}.calendars.${id}.busy[${index}]`);
            return {
              start: readString(slotRecord, "start", `${path}.calendars.${id}.busy[${index}]`),
              end: readString(slotRecord, "end", `${path}.calendars.${id}.busy[${index}]`),
            };
          },
        ),
        errors: readOptionalArray(calendarRecord, "errors", `${path}.calendars.${id}`).map(
          (error, index) => {
            const errorRecord = readRecordValue(error, `${path}.calendars.${id}.errors[${index}]`);
            return readString(errorRecord, "reason", `${path}.calendars.${id}.errors[${index}]`);
          },
        ),
      };
    }),
  };
}
