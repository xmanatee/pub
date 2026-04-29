import { invoke } from "~/core/pub";
import type { CalendarEvent } from "./commands";
import * as cmd from "./commands";

export interface EventInput {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
}

export const calendarApi = {
  list: (from: string, to: string, max = 100): Promise<{ events: CalendarEvent[] }> =>
    invoke(cmd.listEvents, { from, to, max: String(max) }),
  create: (input: EventInput): Promise<CalendarEvent> =>
    invoke(cmd.createEvent, {
      summary: input.summary,
      start: input.start,
      end: input.end,
      description: input.description ?? "",
      location: input.location ?? "",
    }),
  update: (id: string, input: EventInput): Promise<CalendarEvent> =>
    invoke(cmd.updateEvent, {
      id,
      summary: input.summary,
      start: input.start,
      end: input.end,
      description: input.description ?? "",
      location: input.location ?? "",
    }),
  delete: (id: string): Promise<void> => invoke(cmd.deleteEvent, { id }),
};
