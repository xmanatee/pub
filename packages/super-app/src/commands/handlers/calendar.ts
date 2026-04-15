import type { CalendarEvent } from "../results";
import { gogJson } from "./_gog";

interface RawEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  attendees?: { email: string }[];
  htmlLink?: string;
}

function toEvent(raw: RawEvent): CalendarEvent {
  return {
    id: raw.id,
    summary: raw.summary ?? "(untitled)",
    start: raw.start?.dateTime ?? raw.start?.date ?? "",
    end: raw.end?.dateTime ?? raw.end?.date ?? "",
    location: raw.location,
    attendees: raw.attendees?.map((a) => a.email),
    link: raw.htmlLink,
  };
}

export async function today(): Promise<{ events: CalendarEvent[] }> {
  const res = await gogJson<{ events?: RawEvent[] }>([
    "calendar",
    "events",
    "--today",
    "--max",
    "30",
  ]);
  return { events: (res.events ?? []).map(toEvent) };
}

export async function upcoming(params: { days?: number }): Promise<{ events: CalendarEvent[] }> {
  const res = await gogJson<{ events?: RawEvent[] }>([
    "calendar",
    "events",
    "--days",
    String(params.days ?? 7),
    "--max",
    "50",
  ]);
  return { events: (res.events ?? []).map(toEvent) };
}
