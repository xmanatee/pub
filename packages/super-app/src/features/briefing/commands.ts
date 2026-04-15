/**
 * Briefing — all data via daemon-routed commands (shell/exec/agent).
 * Nothing runs inside the super-app.
 */
import type { CommandFunctionSpec } from "~/core/types";

export interface WeatherResult {
  location: string;
  temperatureC: number;
  feelsLikeC: number;
  description: string;
  humidity: number;
  windKph: number;
  forecast: { date: string; minC: number; maxC: number; description: string }[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  link?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  labels: string[];
}

export interface HnStory {
  id: number;
  title: string;
  url: string | null;
  score: number;
  by: string;
  comments: number;
  time: number;
}

export const weatherCurrent: CommandFunctionSpec = {
  name: "briefing.weather",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "curl -sS --max-time 10 -H 'user-agent: curl/8' 'https://wttr.in/?format=j1' | " +
      'jq \'{location: (.nearest_area[0].areaName[0].value + ", " + .nearest_area[0].region[0].value),' +
      " temperatureC: (.current_condition[0].temp_C|tonumber)," +
      " feelsLikeC: (.current_condition[0].FeelsLikeC|tonumber)," +
      " description: .current_condition[0].weatherDesc[0].value," +
      " humidity: (.current_condition[0].humidity|tonumber)," +
      " windKph: (.current_condition[0].windspeedKmph|tonumber)," +
      " forecast: [.weather[0:3][] | {date, minC:(.mintempC|tonumber), maxC:(.maxtempC|tonumber)," +
      " description: .hourly[(.hourly|length/2|floor)].weatherDesc[0].value}]}'",
  },
};

export const calendarToday: CommandFunctionSpec = {
  name: "briefing.calendar.today",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "gog -j calendar events --today --max 30 | " +
      'jq \'{events: [.events[] | {id, summary: (.summary // "(untitled)"),' +
      ' start: (.start.dateTime // .start.date // ""), end: (.end.dateTime // .end.date // ""),' +
      " location, link: .htmlLink}]}'",
  },
};

export const gmailUnread: CommandFunctionSpec = {
  name: "briefing.gmail.unread",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "gog -j gmail search 'is:unread in:inbox' --max 20 | " +
      'jq \'{messages: [.threads[] | {id, threadId: .id, from, subject: (.subject // "(no subject)"),' +
      ' date, unread: (.labels|index("UNREAD")!=null), labels}]}\'',
  },
};

export const newsHn: CommandFunctionSpec = {
  name: "briefing.news.hn",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "IDS=$(curl -sS --max-time 10 https://hacker-news.firebaseio.com/v0/topstories.json " +
      "| jq '.[0:12][]'); " +
      'STORIES="["; FIRST=1; for id in $IDS; do ' +
      'ITEM=$(curl -sS --max-time 10 "https://hacker-news.firebaseio.com/v0/item/$id.json"); ' +
      '[ -z "$ITEM" ] && continue; ' +
      '[ $FIRST -eq 1 ] && FIRST=0 || STORIES="$STORIES,"; STORIES="$STORIES$ITEM"; ' +
      'done; STORIES="$STORIES]"; ' +
      'echo "$STORIES" | jq \'{stories: [.[] | select(.title != null) | {id, title, ' +
      'url: (.url // null), score: (.score // 0), by: (.by // ""), ' +
      "comments: (.descendants // 0), time: (.time // 0)}]}'",
  },
};

export const briefMe: CommandFunctionSpec = {
  name: "briefing.brief",
  returns: "text",
  executor: {
    kind: "agent",
    mode: "detached",
    profile: "fast",
    output: "text",
    prompt:
      "Write a warm, concise 3-4 sentence morning briefing from these facts. " +
      "No bullet lists, no headers.\n\n{{context}}",
  },
};

export const joke: CommandFunctionSpec = {
  name: "briefing.joke",
  returns: "text",
  executor: {
    kind: "agent",
    mode: "detached",
    profile: "fast",
    output: "text",
    prompt: "Tell one short, clever, PG-rated joke. Just the joke, no preamble.",
  },
};

export const quote: CommandFunctionSpec = {
  name: "briefing.quote",
  returns: "text",
  executor: {
    kind: "agent",
    mode: "detached",
    profile: "fast",
    output: "text",
    prompt:
      "Return one short motivational quote (attributed if well-known) under 30 words. No preamble.",
  },
};
