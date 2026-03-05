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

interface SystemChatEntryBase extends ChatEntryBase {
  from: "system";
}

type UserOrAgentChatIdentity = UserChatEntryBase | AgentChatEntryBase;

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

export type TextChatEntry = UserOrAgentChatIdentity & TextChatPayload;
export type AudioChatEntry = UserOrAgentChatIdentity & AudioChatPayload;
export type ImageChatEntry = UserOrAgentChatIdentity & ImageChatPayload;
export type AttachmentChatEntry = UserOrAgentChatIdentity & AttachmentChatPayload;

export type SystemMessageSeverity = "warning" | "error";

export interface SystemChatEntry extends SystemChatEntryBase {
  type: "system";
  content: string;
  severity: SystemMessageSeverity;
}

export type ChatEntry =
  | TextChatEntry
  | AudioChatEntry
  | ImageChatEntry
  | AttachmentChatEntry
  | SystemChatEntry;

export type UserChatEntry = Extract<ChatEntry, { from: "user" }>;

export interface ReceivedFile {
  id: string;
  filename: string;
  mime: string;
  size: number;
  downloadUrl: string;
  timestamp: number;
}
