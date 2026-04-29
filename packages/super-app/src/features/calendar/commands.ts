/**
 * Calendar — backed by Google Calendar via the `gog` CLI. List + create +
 * update + delete events; deeper UX (week/month grid) sits in `page.tsx`.
 */
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

export const listEvents: CommandFunctionSpec = {
  name: "calendar.list",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "gog -j calendar events --from {{from}} --to {{to}} --max {{max}} | " +
      'jq \'{events: [.events[]? | {id, summary: (.summary // "(untitled)"), description: (.description // null),' +
      ' start: (.start.dateTime // .start.date // ""), end: (.end.dateTime // .end.date // ""),' +
      " location: (.location // null), link: (.htmlLink // null), attendees: [(.attendees // [])[].email]}]}'",
  },
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
