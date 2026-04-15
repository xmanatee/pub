/**
 * Result shapes for each command in the catalog. Featured pages import from
 * here. Handlers should `satisfies` the matching type to stay aligned.
 */

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  labels: string[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  link?: string;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  hidden: boolean;
}

export interface FsListResult {
  cwd: string;
  parent: string | null;
  entries: FsEntry[];
}

export interface FsReadResult {
  path: string;
  size: number;
  mime: string;
  encoding: "utf8" | "base64";
  content: string;
  truncated: boolean;
}

export interface ReaderResult {
  url: string;
  title: string;
  byline: string | null;
  excerpt: string | null;
  contentHtml: string;
  textContent: string;
  siteName: string | null;
  publishedTime: string | null;
  fetchedAt: number;
}

export interface WeatherResult {
  location: string;
  temperatureC: number;
  feelsLikeC: number;
  description: string;
  humidity: number;
  windKph: number;
  forecast: { date: string; minC: number; maxC: number; description: string }[];
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

export interface TrackerEntry {
  id: string;
  ts: number;
  text: string;
  category: string | null;
}

export type TelegramAuthState =
  | { status: "logged-out" }
  | { status: "code-sent"; phone: string; phoneCodeHash: string }
  | { status: "needs-password" }
  | { status: "logged-in"; me: { id: string; username?: string; firstName?: string } };

export interface TelegramDialog {
  id: string;
  title: string;
  unread: number;
  lastMessage: string | null;
  date: number;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
}

export interface TelegramMessage {
  id: number;
  from: string | null;
  text: string;
  date: number;
  out: boolean;
  mediaType: "photo" | "document" | "audio" | "video" | "voice" | null;
}
