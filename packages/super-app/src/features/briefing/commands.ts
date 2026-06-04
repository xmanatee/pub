import {
  type JsonRecord,
  readArray,
  readBoolean,
  readNullableString,
  readNumber,
  readRecordValue,
  readString,
  readStringArray,
} from "~/core/json-boundary";
import type { CommandFunctionSpec } from "~/core/types";

export interface WeatherHour {
  time: string;
  temperatureC: number;
  description: string;
  chanceOfRain: number;
}

export interface WeatherForecastDay {
  date: string;
  minC: number;
  maxC: number;
  description: string;
}

export interface WeatherResult {
  location: string;
  temperatureC: number;
  feelsLikeC: number;
  description: string;
  humidity: number;
  windKph: number;
  hourly: WeatherHour[];
  forecast: WeatherForecastDay[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string | null;
  link: string | null;
}

export interface CalendarTodayResult {
  events: CalendarEvent[];
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

export interface GmailUnreadResult {
  messages: GmailMessage[];
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

export interface NewsHnResult {
  stories: HnStory[];
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
      " hourly: [.weather[0].hourly[] | {time: .time, temperatureC:(.tempC|tonumber)," +
      " description: .weatherDesc[0].value, chanceOfRain:(.chanceofrain|tonumber)}]," +
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

function readWeatherTime(record: JsonRecord, key: string, path: string): string {
  const value = readString(record, key, path);
  const padded = value.padStart(4, "0");
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2));
  if (/^\d{1,4}$/.test(value) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return value;
  }
  throw new Error(`${path}.${key} must be a weather time`);
}

function parseWeatherHour(value: unknown, path: string): WeatherHour {
  const record = readRecordValue(value, path);
  return {
    time: readWeatherTime(record, "time", path),
    temperatureC: readNumber(record, "temperatureC", path),
    description: readString(record, "description", path),
    chanceOfRain: readNumber(record, "chanceOfRain", path),
  };
}

function parseWeatherForecastDay(value: unknown, path: string): WeatherForecastDay {
  const record = readRecordValue(value, path);
  return {
    date: readString(record, "date", path),
    minC: readNumber(record, "minC", path),
    maxC: readNumber(record, "maxC", path),
    description: readString(record, "description", path),
  };
}

export function parseWeatherResult(value: unknown): WeatherResult {
  const path = "briefing.weather";
  const record = readRecordValue(value, path);
  return {
    location: readString(record, "location", path),
    temperatureC: readNumber(record, "temperatureC", path),
    feelsLikeC: readNumber(record, "feelsLikeC", path),
    description: readString(record, "description", path),
    humidity: readNumber(record, "humidity", path),
    windKph: readNumber(record, "windKph", path),
    hourly: readArray(record, "hourly", path).map((hour, index) =>
      parseWeatherHour(hour, `${path}.hourly[${index}]`),
    ),
    forecast: readArray(record, "forecast", path).map((day, index) =>
      parseWeatherForecastDay(day, `${path}.forecast[${index}]`),
    ),
  };
}

function parseCalendarEvent(value: unknown, path: string): CalendarEvent {
  const record = readRecordValue(value, path);
  return {
    id: readString(record, "id", path),
    summary: readString(record, "summary", path),
    start: readString(record, "start", path),
    end: readString(record, "end", path),
    location: readNullableString(record, "location", path),
    link: readNullableString(record, "link", path),
  };
}

export function parseCalendarTodayResult(value: unknown): CalendarTodayResult {
  const path = "briefing.calendar.today";
  const record = readRecordValue(value, path);
  return {
    events: readArray(record, "events", path).map((event, index) =>
      parseCalendarEvent(event, `${path}.events[${index}]`),
    ),
  };
}

function parseGmailMessage(value: unknown, path: string): GmailMessage {
  const record = readRecordValue(value, path);
  return {
    id: readString(record, "id", path),
    threadId: readString(record, "threadId", path),
    from: readString(record, "from", path),
    subject: readString(record, "subject", path),
    date: readString(record, "date", path),
    unread: readBoolean(record, "unread", path),
    labels: readStringArray(record, "labels", path),
  };
}

export function parseGmailUnreadResult(value: unknown): GmailUnreadResult {
  const path = "briefing.gmail.unread";
  const record = readRecordValue(value, path);
  return {
    messages: readArray(record, "messages", path).map((message, index) =>
      parseGmailMessage(message, `${path}.messages[${index}]`),
    ),
  };
}

function parseHnStory(value: unknown, path: string): HnStory {
  const record = readRecordValue(value, path);
  return {
    id: readNumber(record, "id", path),
    title: readString(record, "title", path),
    url: readNullableString(record, "url", path),
    score: readNumber(record, "score", path),
    by: readString(record, "by", path),
    comments: readNumber(record, "comments", path),
    time: readNumber(record, "time", path),
  };
}

export function parseNewsHnResult(value: unknown): NewsHnResult {
  const path = "briefing.news.hn";
  const record = readRecordValue(value, path);
  return {
    stories: readArray(record, "stories", path).map((story, index) =>
      parseHnStory(story, `${path}.stories[${index}]`),
    ),
  };
}
