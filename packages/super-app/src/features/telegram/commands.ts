/**
 * Telegram — the client runs entirely in the browser (gramjs with a
 * localStorage-backed `StringSession`). AI verbs live in `core/ai/prompts`,
 * not here; this file owns only the wire shape.
 */
export interface TelegramConfig {
  apiId: number;
  apiHash: string;
}

export type TelegramAuthState =
  | { status: "not-configured" }
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

export type TelegramMediaType = "photo" | "document" | "audio" | "video" | "voice";

export interface TelegramMessage {
  id: number;
  from: string | null;
  text: string;
  date: number;
  out: boolean;
  mediaType: TelegramMediaType | null;
  replyToId: number | null;
  editDate: number | null;
  pinned: boolean;
  reactions: { emoticon: string; count: number; chosen: boolean }[];
}

interface TelegramPeerBase {
  id: string;
  title: string;
  about?: string;
  username?: string;
  muted: boolean;
}

export type TelegramPeerInfo =
  | (TelegramPeerBase & { kind: "user"; phone?: string; blocked: boolean })
  | (TelegramPeerBase & { kind: "group" | "channel"; memberCount?: number });
