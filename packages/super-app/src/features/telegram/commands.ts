/**
 * Telegram wire shapes. The browser calls server functions; GramJS sessions
 * and credentials stay in the local server process.
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

export type TelegramMediaType = "photo" | "document" | "audio" | "video" | "voice" | "video-note";

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

export interface TelegramUpload {
  filename: string;
  mime: string;
  base64: string;
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
