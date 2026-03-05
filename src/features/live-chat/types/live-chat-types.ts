export type ChatDeliveryState = "sending" | "sent" | "received" | "confirmed" | "failed";

interface ChatEntryBase {
  id: string;
  timestamp: number;
}

interface UserChatEntryBase extends ChatEntryBase {
  from: "user";
  delivery: ChatDeliveryState;
}

interface AgentChatEntryBase extends ChatEntryBase {
  from: "agent";
}

type ChatIdentity = UserChatEntryBase | AgentChatEntryBase;

interface TextChatPayload {
  type: "text";
  content: string;
}

interface AudioChatPayload {
  type: "audio";
  audioUrl: string;
  mime: string;
  size: number;
  duration?: number;
  waveform?: number[];
}

interface ImageChatPayload {
  type: "image";
  imageUrl: string;
  mime: string;
  size?: number;
  width?: number;
  height?: number;
}

interface AttachmentChatPayload {
  type: "attachment";
  filename: string;
  mime: string;
  size: number;
  fileUrl?: string;
}

export type TextChatEntry = ChatIdentity & TextChatPayload;
export type AudioChatEntry = ChatIdentity & AudioChatPayload;
export type ImageChatEntry = ChatIdentity & ImageChatPayload;
export type AttachmentChatEntry = ChatIdentity & AttachmentChatPayload;

export type ChatEntry = TextChatEntry | AudioChatEntry | ImageChatEntry | AttachmentChatEntry;
export type UserChatEntry = Extract<ChatEntry, { from: "user" }>;
export type AgentChatEntry = Extract<ChatEntry, { from: "agent" }>;

export interface ReceivedFile {
  id: string;
  filename: string;
  mime: string;
  size: number;
  downloadUrl: string;
  timestamp: number;
}
