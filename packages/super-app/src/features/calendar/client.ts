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
  list: async (from: string, to: string, max = 100): Promise<cmd.CalendarListResult> =>
    cmd.parseCalendarListResult(await invoke(cmd.listEvents, { from, to, max: String(max) })),
  create: async (input: EventInput): Promise<CalendarEvent> =>
    cmd.parseCalendarEvent(
      await invoke(cmd.createEvent, {
        summary: input.summary,
        start: input.start,
        end: input.end,
        description: input.description ?? "",
        location: input.location ?? "",
      }),
      "calendar.create",
    ),
  update: async (id: string, input: EventInput): Promise<CalendarEvent> =>
    cmd.parseCalendarEvent(
      await invoke(cmd.updateEvent, {
        id,
        summary: input.summary,
        start: input.start,
        end: input.end,
        description: input.description ?? "",
        location: input.location ?? "",
      }),
      "calendar.update",
    ),
  delete: (id: string): Promise<void> => invoke(cmd.deleteEvent, { id }),
};
