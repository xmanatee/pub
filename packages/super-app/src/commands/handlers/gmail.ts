import type { GmailMessage } from "../results";
import { gogJson } from "./_gog";

// `gog gmail search` emits one object per thread with flattened metadata.
interface RawThread {
  id: string;
  date: string;
  from: string;
  subject: string;
  labels: string[];
  messageCount: number;
}

interface SearchResponse {
  threads?: RawThread[];
  nextPageToken?: string;
}

function toMessage(t: RawThread): GmailMessage {
  return {
    id: t.id,
    threadId: t.id,
    from: t.from,
    subject: t.subject || "(no subject)",
    date: t.date,
    unread: t.labels.includes("UNREAD"),
    labels: t.labels,
  };
}

export async function unread(): Promise<{ messages: GmailMessage[] }> {
  const res = await gogJson<SearchResponse>([
    "gmail",
    "search",
    "is:unread in:inbox",
    "--max",
    "20",
  ]);
  return { messages: (res.threads ?? []).map(toMessage) };
}

export async function search(params: {
  query: string;
  max?: number;
}): Promise<{ messages: GmailMessage[] }> {
  const res = await gogJson<SearchResponse>([
    "gmail",
    "search",
    params.query,
    "--max",
    String(params.max ?? 20),
  ]);
  return { messages: (res.threads ?? []).map(toMessage) };
}

export async function message(params: { id: string }): Promise<{ body: string }> {
  return gogJson<{ body: string }>(["gmail", "get", params.id]);
}
