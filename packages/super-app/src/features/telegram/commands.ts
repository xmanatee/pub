/**
 * Telegram — the client runs entirely in the browser (gramjs with a
 * localStorage-backed `StringSession`). Daemon-routed commands only cover
 * the AI context-menu actions, which go through the configured agent.
 */
import type { CommandFunctionSpec } from "~/core/types";

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

function agent(name: string, prompt: string): CommandFunctionSpec {
  return {
    name: `telegram.${name}`,
    returns: "text",
    executor: { kind: "agent", mode: "detached", profile: "fast", output: "text", prompt },
  };
}

export const aiExplain = agent(
  "ai.explain",
  "Briefly explain what this message means. No preamble.\n\n{{text}}",
);
export const aiTranslate = agent(
  "ai.translate",
  "Translate this message to English (or to {{lang}} if provided). Just the translation.\n\n{{text}}",
);
export const aiDraft = agent(
  "ai.draft",
  "Draft a reply to this message in the user's voice. Keep it short.\n\n{{text}}",
);
