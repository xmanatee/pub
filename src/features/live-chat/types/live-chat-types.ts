interface ChatEntryBase {
  id: string;
  from: "user" | "agent";
  timestamp: number;
  delivery?: "sending" | "sent" | "received" | "confirmed" | "failed";
}

export interface TextChatEntry extends ChatEntryBase {
  type: "text";
  content: string;
}

export interface AudioChatEntry extends ChatEntryBase {
  type: "audio";
  audioUrl: string;
  mime: string;
  size: number;
  duration?: number;
  waveform?: number[];
}

export interface ImageChatEntry extends ChatEntryBase {
  type: "image";
  imageUrl: string;
  mime: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface AttachmentChatEntry extends ChatEntryBase {
  type: "attachment";
  filename: string;
  mime: string;
  size: number;
  fileUrl?: string;
}

export type ChatEntry = TextChatEntry | AudioChatEntry | ImageChatEntry | AttachmentChatEntry;

export interface ReceivedFile {
  id: string;
  filename: string;
  mime: string;
  size: number;
  downloadUrl: string;
  timestamp: number;
}
