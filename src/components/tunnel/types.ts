export type TunnelViewMode = "canvas" | "chat" | "settings";

export interface ChatEntry {
  id: string;
  from: "user" | "agent";
  content: string;
  timestamp: number;
  delivery?: "sending" | "delivered" | "failed";
}

export interface ReceivedFile {
  id: string;
  filename: string;
  mime: string;
  size: number;
  downloadUrl: string;
  timestamp: number;
}
